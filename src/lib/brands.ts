import { and, eq, isNull } from "drizzle-orm";
import { db } from "./db";
import { brand, connection, post } from "./db/schema";
import { BRAND_COLORS } from "./brand-colors";

export { BRAND_COLORS };

/**
 * Get all brands the user has, in display order.
 * If they have none, create a single default "Personal" brand and return it.
 *
 * Race-safe: every authenticated page calls this on render, so on the first
 * visit several parallel calls will all see "no brands yet" and try to insert.
 * We use a deterministic id (`default_<userId>`) so the second-onward inserts
 * collide on the primary key and ON CONFLICT DO NOTHING makes them no-ops.
 * The user ends up with exactly one default brand.
 */
export async function getOrCreateBrands(userId: string) {
  const existing = await db
    .select()
    .from(brand)
    .where(eq(brand.userId, userId))
    .orderBy(brand.sortOrder, brand.createdAt);

  if (existing.length > 0) return existing;

  const defaultId = `default_${userId}`;
  await db
    .insert(brand)
    .values({
      id: defaultId,
      userId,
      name: "Personal",
      color: BRAND_COLORS[0],
      sortOrder: 0,
      isDefault: true,
    })
    .onConflictDoNothing();

  const rows = await db
    .select()
    .from(brand)
    .where(eq(brand.userId, userId))
    .orderBy(brand.sortOrder, brand.createdAt);

  if (rows.length > 0) {
    const adoptId = rows[0].id;
    await db
      .update(connection)
      .set({ brandId: adoptId, updatedAt: new Date() })
      .where(and(eq(connection.userId, userId), isNull(connection.brandId)));
    await db
      .update(post)
      .set({ brandId: adoptId, updatedAt: new Date() })
      .where(and(eq(post.userId, userId), isNull(post.brandId)));
  }

  return rows;
}

/**
 * Resolve the "current" brand from a cookie / param, falling back to the
 * default brand. Returns the brand row or null if the user has none yet.
 */
export async function resolveActiveBrand(userId: string, preferredId?: string | null) {
  const brands = await getOrCreateBrands(userId);
  if (preferredId) {
    const match = brands.find((b) => b.id === preferredId);
    if (match) return { active: match, all: brands };
  }
  const def = brands.find((b) => b.isDefault) ?? brands[0];
  return { active: def, all: brands };
}

/** Pick the next color in the palette, skipping ones already used. */
export function nextBrandColor(usedColors: string[]): string {
  const used = new Set(usedColors.map((c) => c.toLowerCase()));
  return (
    BRAND_COLORS.find((c) => !used.has(c.toLowerCase())) ??
    BRAND_COLORS[Math.floor(Math.random() * BRAND_COLORS.length)]
  );
}
