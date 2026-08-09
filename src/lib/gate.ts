import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * A single shared passcode, no database.
 *
 * Road Runner used to carry Better Auth + Postgres purely to know who you were.
 * Now that Blotato owns the data, that whole stack existed to guard one internal
 * dashboard — so it is replaced by an HMAC-signed cookie. No DB, nothing to
 * migrate, nothing to leak beyond the passcode itself.
 */

export const COOKIE = "rr_gate";
const MAX_AGE_DAYS = 30;

function secret(): string {
  return process.env.APP_SECRET || process.env.BLOTATO_API_KEY || "";
}

export function passcode(): string {
  return process.env.APP_PASSCODE || "";
}

/** Signed value: "<expiryMs>.<hmac>" — self-contained, no server state. */
export function mintToken(): string {
  const exp = Date.now() + MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const sig = createHmac("sha256", secret()).update(String(exp)).digest("hex");
  return `${exp}.${sig}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!token || !secret()) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig) return false;
  if (Number(exp) < Date.now()) return false;
  const expected = createHmac("sha256", secret()).update(exp).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Constant-time passcode check so the gate can't be probed by timing. */
export function checkPasscode(input: string): boolean {
  const want = passcode();
  if (!want) return false;
  const a = Buffer.from(input);
  const b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: MAX_AGE_DAYS * 24 * 60 * 60,
};
