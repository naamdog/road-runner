import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * config.getConfig() is a CACHED singleton that validates process.env on first
 * call. To exercise different env permutations we:
 *   1. vi.resetModules() so a fresh module (with empty cache) is loaded, and
 *   2. dynamically import("../config") AFTER mutating process.env.
 *
 * We snapshot the full process.env before each test and restore it after, so a
 * test that deletes/overrides keys cannot leak into the next one.
 */

const VALID_TOKEN_ENC_KEY = Buffer.alloc(32, 7).toString("base64");

/** The complete set of required vars with valid dummy values. */
function fullValidEnv(): Record<string, string> {
  return {
    DATABASE_URL: "postgres://user:pass@localhost:5432/test",
    BETTER_AUTH_SECRET: "test-better-auth-secret-at-least-32-chars-long",
    NEXT_PUBLIC_APP_URL: "http://localhost:3000",
    TOKEN_ENC_KEY: VALID_TOKEN_ENC_KEY,
    GOOGLE_CLIENT_ID: "dummy-google-client-id",
    GOOGLE_CLIENT_SECRET: "dummy-google-client-secret",
    META_CLIENT_ID: "dummy-meta-client-id",
    META_CLIENT_SECRET: "dummy-meta-client-secret",
  };
}

/** Every key the config module reads, required + optional. We clear all of
 *  these before applying a test's env so leftover values never interfere. */
const ALL_CONFIG_KEYS = [
  // required
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "NEXT_PUBLIC_APP_URL",
  "TOKEN_ENC_KEY",
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "META_CLIENT_ID",
  "META_CLIENT_SECRET",
  // optional
  "BETTER_AUTH_URL",
  "CRON_SECRET",
  "TIKTOK_CLIENT_KEY",
  "TIKTOK_CLIENT_SECRET",
  "LINKEDIN_CLIENT_ID",
  "LINKEDIN_CLIENT_SECRET",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "REQUIRE_EMAIL_VERIFICATION",
  "LOG_LEVEL",
  "GOOGLE_ALLOWED_DOMAIN",
  "ENABLE_EMAIL_PASSWORD_AUTH",
] as const;

/**
 * Apply `env` as the ONLY config-relevant vars in process.env (all known config
 * keys are cleared first), reset the module cache, and import a fresh copy.
 */
async function loadFreshConfig(env: Record<string, string>) {
  for (const key of ALL_CONFIG_KEYS) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(env)) {
    process.env[key] = value;
  }
  vi.resetModules();
  return import("../config");
}

let envSnapshot: NodeJS.ProcessEnv;

beforeEach(() => {
  envSnapshot = { ...process.env };
});

afterEach(() => {
  // Restore the exact env we had before the test.
  for (const key of Object.keys(process.env)) {
    if (!(key in envSnapshot)) delete process.env[key];
  }
  Object.assign(process.env, envSnapshot);
  vi.resetModules();
});

describe("getConfig — valid env", () => {
  it("returns the expected shape for a full valid env", async () => {
    const { getConfig } = await loadFreshConfig(fullValidEnv());
    const cfg = getConfig();

    expect(cfg.databaseUrl).toBe("postgres://user:pass@localhost:5432/test");
    expect(cfg.betterAuthSecret).toBe(
      "test-better-auth-secret-at-least-32-chars-long",
    );
    expect(cfg.appUrl).toBe("http://localhost:3000");
    // betterAuthUrl falls back to appUrl when BETTER_AUTH_URL is absent.
    expect(cfg.betterAuthUrl).toBe("http://localhost:3000");
    expect(cfg.google).toEqual({
      clientId: "dummy-google-client-id",
      clientSecret: "dummy-google-client-secret",
    });
    expect(cfg.meta).toEqual({
      clientId: "dummy-meta-client-id",
      clientSecret: "dummy-meta-client-secret",
    });
    // Optionals default to null/false/info when absent.
    expect(cfg.tiktok).toBeNull();
    expect(cfg.linkedin).toBeNull();
    expect(cfg.email).toBeNull();
    expect(cfg.cronSecret).toBeNull();
    expect(cfg.requireEmailVerification).toBe(false);
    expect(cfg.logLevel).toBe("info");
    // Google-only, TEFL-internal defaults.
    expect(cfg.googleAllowedDomain).toBe("teflheaven.com");
    expect(cfg.enableEmailPasswordAuth).toBe(false);
  });

  it("decodes TOKEN_ENC_KEY to a 32-byte Buffer", async () => {
    const { getConfig } = await loadFreshConfig(fullValidEnv());
    const cfg = getConfig();

    expect(Buffer.isBuffer(cfg.tokenEncKey)).toBe(true);
    expect(cfg.tokenEncKey.length).toBe(32);
    // Round-trips back to the base64 we supplied.
    expect(cfg.tokenEncKey.toString("base64")).toBe(VALID_TOKEN_ENC_KEY);
  });

  it("caches the result across calls (same reference)", async () => {
    const { getConfig } = await loadFreshConfig(fullValidEnv());
    const first = getConfig();
    const second = getConfig();
    expect(first).toBe(second);
  });

  it("uses BETTER_AUTH_URL when present, overriding the appUrl fallback", async () => {
    const { getConfig } = await loadFreshConfig({
      ...fullValidEnv(),
      BETTER_AUTH_URL: "https://auth.example.com",
    });
    const cfg = getConfig();
    expect(cfg.betterAuthUrl).toBe("https://auth.example.com");
    expect(cfg.appUrl).toBe("http://localhost:3000");
  });

  it("reads CRON_SECRET and LOG_LEVEL when present", async () => {
    const { getConfig } = await loadFreshConfig({
      ...fullValidEnv(),
      CRON_SECRET: "cron-secret-value",
      LOG_LEVEL: "debug",
    });
    const cfg = getConfig();
    expect(cfg.cronSecret).toBe("cron-secret-value");
    expect(cfg.logLevel).toBe("debug");
  });
});

describe("getConfig — missing required vars", () => {
  const REQUIRED = [
    "DATABASE_URL",
    "BETTER_AUTH_SECRET",
    "NEXT_PUBLIC_APP_URL",
    "TOKEN_ENC_KEY",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "META_CLIENT_ID",
    "META_CLIENT_SECRET",
  ] as const;

  for (const missing of REQUIRED) {
    it(`throws and names ${missing} when it is missing`, async () => {
      const env = fullValidEnv();
      delete env[missing];
      const { getConfig } = await loadFreshConfig(env);
      expect(() => getConfig()).toThrow(missing);
    });
  }

  it("lists ALL missing vars in a single aggregated error", async () => {
    const env = fullValidEnv();
    delete env.DATABASE_URL;
    delete env.GOOGLE_CLIENT_SECRET;
    delete env.META_CLIENT_ID;

    const { getConfig } = await loadFreshConfig(env);

    let caught: unknown;
    try {
      getConfig();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(Error);
    const message = (caught as Error).message;
    expect(message).toContain("DATABASE_URL");
    expect(message).toContain("GOOGLE_CLIENT_SECRET");
    expect(message).toContain("META_CLIENT_ID");
    // The vars that ARE present must not be reported as problems.
    expect(message).not.toContain("BETTER_AUTH_SECRET");
    expect(message).not.toContain("NEXT_PUBLIC_APP_URL");
  });

  it("rejects a BETTER_AUTH_SECRET shorter than 32 characters and names it", async () => {
    const { getConfig } = await loadFreshConfig({
      ...fullValidEnv(),
      BETTER_AUTH_SECRET: "too-short",
    });
    expect(() => getConfig()).toThrow("BETTER_AUTH_SECRET");
  });
});

describe("getConfig — TOKEN_ENC_KEY validation", () => {
  it("throws mentioning TOKEN_ENC_KEY when it is not valid base64", async () => {
    const { getConfig } = await loadFreshConfig({
      ...fullValidEnv(),
      // '@' and '!' are not valid base64 chars; Buffer.from drops them so the
      // re-encode comparison in decodeTokenEncKey fails.
      TOKEN_ENC_KEY: "not-valid-base64-@@@!!!",
    });
    expect(() => getConfig()).toThrow(/TOKEN_ENC_KEY.*base64/);
  });

  it("throws mentioning the byte length when the key decodes to != 32 bytes", async () => {
    const { getConfig } = await loadFreshConfig({
      ...fullValidEnv(),
      // 16 bytes, not 32.
      TOKEN_ENC_KEY: Buffer.alloc(16, 1).toString("base64"),
    });
    let caught: unknown;
    try {
      getConfig();
    } catch (e) {
      caught = e;
    }
    const message = (caught as Error).message;
    expect(message).toContain("TOKEN_ENC_KEY");
    expect(message).toContain("32 bytes");
    expect(message).toContain("got 16");
  });

  it("accepts a valid base64 key that decodes to exactly 32 bytes", async () => {
    const { getConfig } = await loadFreshConfig({
      ...fullValidEnv(),
      TOKEN_ENC_KEY: Buffer.alloc(32, 9).toString("base64"),
    });
    expect(() => getConfig()).not.toThrow();
    expect(getConfig().tokenEncKey.length).toBe(32);
  });
});

describe("googleAllowedDomain", () => {
  it('defaults to "teflheaven.com" when absent', async () => {
    const mod = await loadFreshConfig(fullValidEnv());
    expect(mod.getConfig().googleAllowedDomain).toBe("teflheaven.com");
  });

  it("uses GOOGLE_ALLOWED_DOMAIN when present, overriding the default", async () => {
    const mod = await loadFreshConfig({
      ...fullValidEnv(),
      GOOGLE_ALLOWED_DOMAIN: "example.com",
    });
    expect(mod.getConfig().googleAllowedDomain).toBe("example.com");
  });
});

describe("enableEmailPasswordAuth", () => {
  it('is true only when ENABLE_EMAIL_PASSWORD_AUTH === "true"', async () => {
    const mod = await loadFreshConfig({
      ...fullValidEnv(),
      ENABLE_EMAIL_PASSWORD_AUTH: "true",
    });
    expect(mod.getConfig().enableEmailPasswordAuth).toBe(true);
  });

  it("is false when absent (Google-only by default)", async () => {
    const mod = await loadFreshConfig(fullValidEnv());
    expect(mod.getConfig().enableEmailPasswordAuth).toBe(false);
  });

  it('is false for any non-"true" value (e.g. "false", "1", "TRUE")', async () => {
    for (const value of ["false", "1", "TRUE", "yes", ""]) {
      const mod = await loadFreshConfig({
        ...fullValidEnv(),
        ENABLE_EMAIL_PASSWORD_AUTH: value,
      });
      expect(mod.getConfig().enableEmailPasswordAuth).toBe(false);
    }
  });
});

describe("isTiktokConfigured", () => {
  it("is null/false unless BOTH TikTok vars are present", async () => {
    // Neither present.
    let mod = await loadFreshConfig(fullValidEnv());
    expect(mod.getConfig().tiktok).toBeNull();
    expect(mod.isTiktokConfigured()).toBe(false);

    // Only the key present.
    mod = await loadFreshConfig({
      ...fullValidEnv(),
      TIKTOK_CLIENT_KEY: "tk-key",
    });
    expect(mod.getConfig().tiktok).toBeNull();
    expect(mod.isTiktokConfigured()).toBe(false);

    // Only the secret present.
    mod = await loadFreshConfig({
      ...fullValidEnv(),
      TIKTOK_CLIENT_SECRET: "tk-secret",
    });
    expect(mod.getConfig().tiktok).toBeNull();
    expect(mod.isTiktokConfigured()).toBe(false);
  });

  it("is non-null/true when BOTH TikTok vars are present", async () => {
    const mod = await loadFreshConfig({
      ...fullValidEnv(),
      TIKTOK_CLIENT_KEY: "tk-key",
      TIKTOK_CLIENT_SECRET: "tk-secret",
    });
    expect(mod.getConfig().tiktok).toEqual({
      clientKey: "tk-key",
      clientSecret: "tk-secret",
    });
    expect(mod.isTiktokConfigured()).toBe(true);
  });
});

describe("isLinkedinConfigured", () => {
  it("is null/false unless BOTH LinkedIn vars are present", async () => {
    let mod = await loadFreshConfig(fullValidEnv());
    expect(mod.getConfig().linkedin).toBeNull();
    expect(mod.isLinkedinConfigured()).toBe(false);

    mod = await loadFreshConfig({
      ...fullValidEnv(),
      LINKEDIN_CLIENT_ID: "li-id",
    });
    expect(mod.getConfig().linkedin).toBeNull();
    expect(mod.isLinkedinConfigured()).toBe(false);

    mod = await loadFreshConfig({
      ...fullValidEnv(),
      LINKEDIN_CLIENT_SECRET: "li-secret",
    });
    expect(mod.getConfig().linkedin).toBeNull();
    expect(mod.isLinkedinConfigured()).toBe(false);
  });

  it("is non-null/true when BOTH LinkedIn vars are present", async () => {
    const mod = await loadFreshConfig({
      ...fullValidEnv(),
      LINKEDIN_CLIENT_ID: "li-id",
      LINKEDIN_CLIENT_SECRET: "li-secret",
    });
    expect(mod.getConfig().linkedin).toEqual({
      clientId: "li-id",
      clientSecret: "li-secret",
    });
    expect(mod.isLinkedinConfigured()).toBe(true);
  });
});

describe("isEmailConfigured", () => {
  it("is null/false unless BOTH email vars are present", async () => {
    let mod = await loadFreshConfig(fullValidEnv());
    expect(mod.getConfig().email).toBeNull();
    expect(mod.isEmailConfigured()).toBe(false);

    mod = await loadFreshConfig({
      ...fullValidEnv(),
      RESEND_API_KEY: "re_test_key",
    });
    expect(mod.getConfig().email).toBeNull();
    expect(mod.isEmailConfigured()).toBe(false);

    mod = await loadFreshConfig({
      ...fullValidEnv(),
      EMAIL_FROM: "noreply@example.com",
    });
    expect(mod.getConfig().email).toBeNull();
    expect(mod.isEmailConfigured()).toBe(false);
  });

  it("is non-null/true when BOTH email vars are present", async () => {
    const mod = await loadFreshConfig({
      ...fullValidEnv(),
      RESEND_API_KEY: "re_test_key",
      EMAIL_FROM: "noreply@example.com",
    });
    expect(mod.getConfig().email).toEqual({
      resendApiKey: "re_test_key",
      from: "noreply@example.com",
    });
    expect(mod.isEmailConfigured()).toBe(true);
  });
});

describe("requireEmailVerification", () => {
  it('is true only when REQUIRE_EMAIL_VERIFICATION === "true"', async () => {
    const mod = await loadFreshConfig({
      ...fullValidEnv(),
      REQUIRE_EMAIL_VERIFICATION: "true",
    });
    expect(mod.getConfig().requireEmailVerification).toBe(true);
  });

  it("is false when absent", async () => {
    const mod = await loadFreshConfig(fullValidEnv());
    expect(mod.getConfig().requireEmailVerification).toBe(false);
  });

  it('is false for any non-"true" value (e.g. "false", "1", "TRUE")', async () => {
    for (const value of ["false", "1", "TRUE", "yes", ""]) {
      const mod = await loadFreshConfig({
        ...fullValidEnv(),
        REQUIRE_EMAIL_VERIFICATION: value,
      });
      expect(mod.getConfig().requireEmailVerification).toBe(false);
    }
  });
});
