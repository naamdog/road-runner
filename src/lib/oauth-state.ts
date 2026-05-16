import { createHmac, randomBytes } from "node:crypto";

const secret = () =>
  process.env.BETTER_AUTH_SECRET || "dev-secret-change-me-32-bytes-min";

/**
 * Sign a short-lived OAuth state payload to bind it to the user.
 * Returns `state` for the URL and `codeVerifier` (for PKCE flows).
 */
export function signState(payload: {
  userId: string;
  platform: string;
  brandId: string;
  nonce?: string;
}): { state: string; codeVerifier: string } {
  const data = {
    ...payload,
    nonce: payload.nonce ?? randomBytes(8).toString("hex"),
    iat: Date.now(),
  };
  const json = Buffer.from(JSON.stringify(data)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(json).digest("base64url");
  const codeVerifier = randomBytes(48).toString("base64url");
  return { state: `${json}.${sig}`, codeVerifier };
}

export function verifyState(state: string): {
  userId: string;
  platform: string;
  brandId: string;
  nonce: string;
  iat: number;
} | null {
  if (!state.includes(".")) return null;
  const [json, sig] = state.split(".");
  const expected = createHmac("sha256", secret()).update(json).digest("base64url");
  if (expected !== sig) return null;
  try {
    const data = JSON.parse(Buffer.from(json, "base64url").toString());
    if (Date.now() - data.iat > 10 * 60 * 1000) return null;
    return data;
  } catch {
    return null;
  }
}

export function codeChallenge(verifier: string): string {
  return require("node:crypto")
    .createHash("sha256")
    .update(verifier)
    .digest("base64url");
}
