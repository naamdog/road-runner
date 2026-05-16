import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brand } from "@/lib/db/schema";
import { getSession } from "@/lib/session";
import { getOrCreateBrands, nextBrandColor, BRAND_COLORS } from "@/lib/brands";

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  const brands = await getOrCreateBrands(session.user.id);
  return NextResponse.json({ brands });
}

const createSchema = z.object({
  name: z.string().min(1).max(60),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  let parsed: z.infer<typeof createSchema>;
  try {
    parsed = createSchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bad request" },
      { status: 400 }
    );
  }

  const existing = await db
    .select({ color: brand.color, sortOrder: brand.sortOrder })
    .from(brand)
    .where(eq(brand.userId, session.user.id));
  const color = parsed.color ?? nextBrandColor(existing.map((b) => b.color));
  const sortOrder = Math.max(0, ...existing.map((b) => b.sortOrder)) + 1;

  const id = nanoid();
  const [row] = await db
    .insert(brand)
    .values({
      id,
      userId: session.user.id,
      name: parsed.name,
      color,
      sortOrder,
      isDefault: existing.length === 0,
    })
    .returning();
  return NextResponse.json({ brand: row });
}
