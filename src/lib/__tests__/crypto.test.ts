import { beforeAll, describe, expect, it } from "vitest";

// IMPORTANT: set env BEFORE importing crypto, because crypto -> config getConfig()
// reads these. getConfig() is lazy (first-call) but we never want it to throw here,
// so populate every required var with a valid dummy value.
const TEST_KEY_B64 = Buffer.alloc(32, 7).toString("base64");
process.env.TOKEN_ENC_KEY = TEST_KEY_B64;
process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/test";
process.env.BETTER_AUTH_SECRET = "test-better-auth-secret-at-least-32-chars-long";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
process.env.GOOGLE_CLIENT_ID = "dummy-google-client-id";
process.env.GOOGLE_CLIENT_SECRET = "dummy-google-client-secret";
process.env.META_CLIENT_ID = "dummy-meta-client-id";
process.env.META_CLIENT_SECRET = "dummy-meta-client-secret";

// Dynamically imported after env is set.
let encryptSecret: typeof import("../crypto").encryptSecret;
let decryptSecret: typeof import("../crypto").decryptSecret;
let isEncrypted: typeof import("../crypto").isEncrypted;

beforeAll(async () => {
  const mod = await import("../crypto");
  encryptSecret = mod.encryptSecret;
  decryptSecret = mod.decryptSecret;
  isEncrypted = mod.isEncrypted;
});

describe("crypto", () => {
  it("round-trips a secret", () => {
    const plain = "super-secret-access-token-12345";
    const enc = encryptSecret(plain);
    expect(enc).toMatch(/^enc:v1:/);
    expect(enc).not.toContain(plain);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it("round-trips empty and unicode strings", () => {
    expect(decryptSecret(encryptSecret(""))).toBe("");
    const unicode = "tøken-✓-emoji-😀-multibyte";
    expect(decryptSecret(encryptSecret(unicode))).toBe(unicode);
  });

  it("produces a fresh random IV per call (different ciphertext, same plaintext)", () => {
    const plain = "same-input";
    const a = encryptSecret(plain);
    const b = encryptSecret(plain);
    expect(a).not.toBe(b);
    expect(decryptSecret(a)).toBe(plain);
    expect(decryptSecret(b)).toBe(plain);
  });

  it("passes through legacy plaintext unchanged", () => {
    const legacy = "ya29.legacy-plaintext-token";
    expect(decryptSecret(legacy)).toBe(legacy);
    // anything not starting with the prefix is treated as legacy
    expect(decryptSecret("enc:v0:not-a-real-format")).toBe(
      "enc:v0:not-a-real-format",
    );
  });

  it("throws on tampering (GCM auth-tag mismatch)", () => {
    const enc = encryptSecret("tamper-me");
    // Flip a character in the base64 body (after the "enc:v1:" prefix).
    const body = enc.slice("enc:v1:".length);
    const flipChar = body[body.length - 2] === "A" ? "B" : "A";
    const tampered =
      "enc:v1:" + body.slice(0, body.length - 2) + flipChar + body.slice(-1);
    expect(tampered).not.toBe(enc);
    expect(() => decryptSecret(tampered)).toThrow();
  });

  it("handles null and undefined", () => {
    expect(decryptSecret(null)).toBeNull();
    expect(decryptSecret(undefined)).toBeNull();
  });

  describe("isEncrypted", () => {
    it("is true for encrypted values", () => {
      expect(isEncrypted(encryptSecret("x"))).toBe(true);
    });

    it("is false for plaintext, null, and undefined", () => {
      expect(isEncrypted("plaintext")).toBe(false);
      expect(isEncrypted("")).toBe(false);
      expect(isEncrypted(null)).toBe(false);
      expect(isEncrypted(undefined)).toBe(false);
    });
  });
});
