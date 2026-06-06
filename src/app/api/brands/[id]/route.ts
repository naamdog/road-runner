import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
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

  const userId = session.user.id;
  const now = new Date();

  // Atomic: verify ownership BEFORE demoting anything (a bad/non-owned id must
  // never wipe the user's existing default), and demote others BEFORE promoting
  // this one so the "one default per user" unique index is never transiently
  // violated within the transaction.
  const updated = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: brand.id })
      .from(brand)
      .where(and(eq(brand.id, id), eq(brand.userId, userId)));
    if (!existing) return null;

    if (parsed.isDefault === true) {
      await tx
        .update(brand)
        .set({ isDefault: false, updatedAt: now })
        .where(and(eq(brand.userId, userId), ne(brand.id, id)));
    }

    const [row] = await tx
      .update(brand)
      .set({
        ...(parsed.name !== undefined ? { name: parsed.name } : {}),
        ...(parsed.color !== undefined ? { color: parsed.color } : {}),
        ...(parsed.isDefault !== undefined ? { isDefault: parsed.isDefault } : {}),
        updatedAt: now,
      })
      .where(and(eq(brand.id, id), eq(brand.userId, userId)))
      .returning();
    return row ?? null;
  });

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
