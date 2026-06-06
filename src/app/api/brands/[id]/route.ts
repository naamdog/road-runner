import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brand, connection, post, tubePost } from "@/lib/db/schema";
import { getSession } from "@/lib/session";

const patchSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  const { id } = await params;

  let parsed: z.infer<typeof patchSchema>;
  try {
    parsed = patchSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bad request" },
      { status: 400 }
    );
  }

  if (parsed.isDefault === true) {
    // Demote any other default first
    await db
      .update(brand)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(eq(brand.userId, session.user.id));
  }

  const [updated] = await db
    .update(brand)
    .set({
      ...(parsed.name !== undefined ? { name: parsed.name } : {}),
      ...(parsed.color !== undefined ? { color: parsed.color } : {}),
      ...(parsed.isDefault !== undefined ? { isDefault: parsed.isDefault } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(brand.id, id), eq(brand.userId, session.user.id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }
  return NextResponse.json({ brand: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  const { id } = await params;

  const userId = session.user.id;

  // Order by sortOrder/createdAt so the "first remaining brand" fallback is
  // deterministic and matches getOrCreateBrands' ordering.
  const allBrands = await db
    .select({ id: brand.id, isDefault: brand.isDefault })
    .from(brand)
    .where(eq(brand.userId, userId))
    .orderBy(brand.sortOrder, brand.createdAt);

  // Never delete the last remaining brand — the user must always have one.
  if (allBrands.length <= 1) {
    return NextResponse.json(
      { error: "You need at least one brand. Make another first." },
      { status: 400 }
    );
  }

  // Never allow deleting a brand you don't own (or that doesn't exist).
  const target = allBrands.find((b) => b.id === id);
  if (!target) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  // Pick where orphaned content goes: prefer the user's default brand, else the
  // first remaining brand by sort order. Never the brand being deleted.
  const others = allBrands.filter((b) => b.id !== id);
  const fallback = others.find((b) => b.isDefault) ?? others[0];
  const fallbackId = fallback.id;

  const now = new Date();

  // Do the reassign + delete atomically so connected accounts and scheduled
  // content are never lost. Without this, the FKs would CASCADE-delete the
  // brand's connections and NULL-orphan its posts/tube_posts.
  await db.transaction(async (tx) => {
    // Reassign connected accounts so they survive the delete.
    await tx
      .update(connection)
      .set({ brandId: fallbackId, updatedAt: now })
      .where(and(eq(connection.userId, userId), eq(connection.brandId, id)));

    // Reassign scheduled / drafted multi-platform posts.
    await tx
      .update(post)
      .set({ brandId: fallbackId, updatedAt: now })
      .where(and(eq(post.userId, userId), eq(post.brandId, id)));

    // Reassign scheduled / drafted long-form (TubeRunner) posts.
    await tx
      .update(tubePost)
      .set({ brandId: fallbackId, updatedAt: now })
      .where(and(eq(tubePost.userId, userId), eq(tubePost.brandId, id)));

    // Now safe to delete the (re-parented) brand.
    await tx
      .delete(brand)
      .where(and(eq(brand.id, id), eq(brand.userId, userId)));

    // If the deleted brand was the default, promote the fallback so the user
    // always has exactly one default brand.
    if (target.isDefault) {
      await tx
        .update(brand)
        .set({ isDefault: true, updatedAt: now })
        .where(and(eq(brand.id, fallbackId), eq(brand.userId, userId)));
    }
  });

  return NextResponse.json({ ok: true });
}
