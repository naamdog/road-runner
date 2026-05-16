import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brand, connection, post } from "@/lib/db/schema";
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

  const allBrands = await db
    .select({ id: brand.id, isDefault: brand.isDefault })
    .from(brand)
    .where(eq(brand.userId, session.user.id));

  if (allBrands.length <= 1) {
    return NextResponse.json(
      { error: "You need at least one brand. Make another first." },
      { status: 400 }
    );
  }
  const target = allBrands.find((b) => b.id === id);
  if (!target) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }

  await db
    .delete(brand)
    .where(and(eq(brand.id, id), eq(brand.userId, session.user.id)));

  // If we deleted the default, promote another brand
  if (target.isDefault) {
    const [next] = await db
      .select({ id: brand.id })
      .from(brand)
      .where(eq(brand.userId, session.user.id))
      .limit(1);
    if (next) {
      await db
        .update(brand)
        .set({ isDefault: true, updatedAt: new Date() })
        .where(eq(brand.id, next.id));
    }
  }

  return NextResponse.json({ ok: true });
}
