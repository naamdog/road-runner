import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brand, connection } from "@/lib/db/schema";
import { getSession } from "@/lib/session";

const patchSchema = z.object({
  brandId: z.string().min(1),
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
  const [own] = await db
    .select({ id: brand.id })
    .from(brand)
    .where(and(eq(brand.id, parsed.brandId), eq(brand.userId, session.user.id)));
  if (!own) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }
  const rows = await db
    .update(connection)
    .set({ brandId: parsed.brandId, updatedAt: new Date() })
    .where(
      and(eq(connection.id, id), eq(connection.userId, session.user.id))
    )
    .returning({ id: connection.id });
  if (rows.length === 0) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
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

  const rows = await db
    .delete(connection)
    .where(
      and(eq(connection.id, id), eq(connection.userId, session.user.id))
    )
    .returning({ id: connection.id });

  if (rows.length === 0) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
