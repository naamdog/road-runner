import { and, eq, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "./db";
import { brand, connection, post } from "./db/schema";

/** Hex colors used as defaults for new brands, cycled through. */
export const BRAND_COLORS = [
  "#CCFF00", // electric lime — Road Runner brand
  "#4FB3FF", // sky
  "#FF66A8", // pink
  "#FFB02A", // amber
  "#2BD472", // green
  "#A78BFA", // violet
  "#FF7849", // coral
  "#06D6A0", // teal
];

/**
 * Get all brands the user has, in display order.
 * If they have none, create a default "Personal" brand and return it.
 */
export async function getOrCreateBrands(userId: string) {
  const rows = await db
    .select()
    .from(brand)
    .where(eq(brand.userId, userId))
    .orderBy(brand.sortOrder, brand.createdAt);

  if (rows.length > 0) return rows;

  const id = nanoid();
  const inserted = await db
    .insert(brand)
    .values({
      id,
      userId,
      name: "Personal",
      color: BRAND_COLORS[0],
      sortOrder: 0,
      isDefault: true,
    })
    .returning();

  // Adopt any pre-existing connections / posts that have no brand yet.
  await db
    .update(connection)
    .set({ brandId: id, updatedAt: new Date() })
    .where(and(eq(connection.userId, userId), isNull(connection.brandId)));
  await db
    .update(post)
    .set({ brandId: id, updatedAt: new Date() })
    .where(and(eq(post.userId, userId), isNull(post.brandId)));

  return inserted;
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
