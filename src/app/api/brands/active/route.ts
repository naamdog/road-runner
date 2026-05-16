import { NextRequest, NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { brand } from "@/lib/db/schema";
import { getSession } from "@/lib/session";
import { writeActiveBrandCookie, clearActiveBrandCookie } from "@/lib/active-brand";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  const { brandId } = (await req.json().catch(() => ({}))) as {
    brandId?: string;
  };
  if (!brandId) {
    await clearActiveBrandCookie();
    return NextResponse.json({ ok: true, cleared: true });
  }
  const [b] = await db
    .select({ id: brand.id })
    .from(brand)
    .where(and(eq(brand.id, brandId), eq(brand.userId, session.user.id)));
  if (!b) {
    return NextResponse.json({ error: "Brand not found" }, { status: 404 });
  }
  await writeActiveBrandCookie(brandId);
  return NextResponse.json({ ok: true });
}
