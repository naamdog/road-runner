import { cookies } from "next/headers";
import { getOrCreateBrands } from "@/lib/brands";

const COOKIE = "rr_active_brand";

export async function readActiveBrandCookie(): Promise<string | null> {
  const c = await cookies();
  return c.get(COOKIE)?.value ?? null;
}

export async function writeActiveBrandCookie(brandId: string) {
  const c = await cookies();
  c.set(COOKIE, brandId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 365, // 1 year
    path: "/",
  });
}

export async function clearActiveBrandCookie() {
  const c = await cookies();
  c.delete(COOKIE);
}

/**
 * Centralized active-brand resolver: cookie -> default -> first, WITH staleness
 * validation. The `rr_active_brand` cookie is only honored if a brand with that
 * id still exists AND belongs to `userId` (so a stale cookie left over after a
 * brand is deleted, or copied from another account, can never leak content into
 * the wrong brand). Otherwise we fall back to the user's default brand, then
 * their first brand by sort order.
 *
 * Returns the resolved brand id, or null if the user has no brands at all
 * (getOrCreateBrands normally guarantees at least one, but we stay defensive).
 */
export async function resolveActiveBrand(userId: string): Promise<string | null> {
  // getOrCreateBrands returns the list ordered by sortOrder, then createdAt,
  // so brands[0] is the user's first brand by sort order.
  const brands = await getOrCreateBrands(userId);
  if (brands.length === 0) return null;

  const cookieId = await readActiveBrandCookie();
  if (cookieId) {
    const match = brands.find((b) => b.id === cookieId);
    if (match) return match.id; // valid + owned -> honor it
    // Stale / foreign cookie: ignore and fall through.
  }

  const def = brands.find((b) => b.isDefault);
  if (def) return def.id;

  return brands[0].id;
}
