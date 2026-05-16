import { cookies } from "next/headers";

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
