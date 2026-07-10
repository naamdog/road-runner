import { z } from "zod";

/**
 * Application configuration, validated once and cached.
 *
 * Validation is LAZY: it runs on the first `getConfig()` call, never at import
 * time. Next.js builds import modules without a populated environment, so
 * throwing at import time would break the build. A misconfigured runtime fails
 * loudly via a single aggregated error that lists every missing/invalid var.
 */
export interface AppConfig {
  databaseUrl: string;
  betterAuthSecret: string;
  appUrl: string;
  betterAuthUrl: string;
  tokenEncKey: Buffer; // decoded 32 bytes
  google: { clientId: string; clientSecret: string };
  meta: { clientId: string; clientSecret: string };
  tiktok: { clientKey: string; clientSecret: string } | null;
  linkedin: { clientId: string; clientSecret: string } | null;
  cronSecret: string | null;
  email: { resendApiKey: string; from: string } | null;
  requireEmailVerification: boolean;
  logLevel: string;
  /** Google Workspace hosted domain required for Google sign-in (e.g. "teflheaven.com"). */
  googleAllowedDomain: string;
  /**
   * Whether the email+password sign-in/sign-up path is active. Defaults to
   * `false` (Google-only, TEFL-internal use). A single flag flip
   * (`ENABLE_EMAIL_PASSWORD_AUTH=true`) re-enables it for public/paid use
   * later without any code changes — the email+password code is disabled,
   * not deleted.
   */
  enableEmailPasswordAuth: boolean;
}

const requiredSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  NEXT_PUBLIC_APP_URL: z.string().min(1, "NEXT_PUBLIC_APP_URL is required"),
  TOKEN_ENC_KEY: z.string().min(1, "TOKEN_ENC_KEY is required"),
  GOOGLE_CLIENT_ID: z.string().min(1, "GOOGLE_CLIENT_ID is required"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "GOOGLE_CLIENT_SECRET is required"),
  META_CLIENT_ID: z.string().min(1, "META_CLIENT_ID is required"),
  META_CLIENT_SECRET: z.string().min(1, "META_CLIENT_SECRET is required"),
});

let cached: AppConfig | null = null;

/** Decode a base64 TOKEN_ENC_KEY to a Buffer, asserting exactly 32 bytes. */
function decodeTokenEncKey(raw: string, problems: string[]): Buffer | null {
  const buf = Buffer.from(raw, "base64");
  // Buffer.from with base64 silently drops invalid chars; re-encoding and
  // comparing catches malformed input.
  if (buf.toString("base64").replace(/=+$/, "") !== raw.replace(/=+$/, "")) {
    problems.push("TOKEN_ENC_KEY must be valid base64");
    return null;
  }
  if (buf.length !== 32) {
    problems.push(
      `TOKEN_ENC_KEY must decode to exactly 32 bytes (got ${buf.length})`
    );
    return null;
  }
  return buf;
}

function loadConfig(): AppConfig {
  const env = process.env;
  const problems: string[] = [];

  const parsed = requiredSchema.safeParse(env);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".");
      // Prefix with the var name so a missing var (whose default zod message
      // omits the key) is still clearly identifiable in the aggregated error.
      problems.push(key ? `${key}: ${issue.message}` : issue.message);
    }
  }

  // Decode + validate the token encryption key only when it is present;
  // its absence is already reported above.
  let tokenEncKey: Buffer | null = null;
  if (parsed.success || (env.TOKEN_ENC_KEY && env.TOKEN_ENC_KEY.length > 0)) {
    tokenEncKey = decodeTokenEncKey(env.TOKEN_ENC_KEY ?? "", problems);
  }

  if (problems.length > 0 || !parsed.success || !tokenEncKey) {
    throw new Error(
      `Invalid application configuration:\n${problems
        .map((p) => `  - ${p}`)
        .join("\n")}`
    );
  }

  const data = parsed.data;

  const tiktok =
    env.TIKTOK_CLIENT_KEY && env.TIKTOK_CLIENT_SECRET
      ? {
          clientKey: env.TIKTOK_CLIENT_KEY,
          clientSecret: env.TIKTOK_CLIENT_SECRET,
        }
      : null;

  const linkedin =
    env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET
      ? {
          clientId: env.LINKEDIN_CLIENT_ID,
          clientSecret: env.LINKEDIN_CLIENT_SECRET,
        }
      : null;

  const email =
    env.RESEND_API_KEY && env.EMAIL_FROM
      ? { resendApiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM }
      : null;

  return {
    databaseUrl: data.DATABASE_URL,
    betterAuthSecret: data.BETTER_AUTH_SECRET,
    appUrl: data.NEXT_PUBLIC_APP_URL,
    betterAuthUrl: env.BETTER_AUTH_URL || data.NEXT_PUBLIC_APP_URL,
    tokenEncKey,
    google: {
      clientId: data.GOOGLE_CLIENT_ID,
      clientSecret: data.GOOGLE_CLIENT_SECRET,
    },
    meta: {
      clientId: data.META_CLIENT_ID,
      clientSecret: data.META_CLIENT_SECRET,
    },
    tiktok,
    linkedin,
    cronSecret: env.CRON_SECRET || null,
    email,
    requireEmailVerification: env.REQUIRE_EMAIL_VERIFICATION === "true",
    logLevel: env.LOG_LEVEL || "info",
    googleAllowedDomain: env.GOOGLE_ALLOWED_DOMAIN || "teflheaven.com",
    enableEmailPasswordAuth: env.ENABLE_EMAIL_PASSWORD_AUTH === "true",
  };
}

/**
 * Returns the validated, cached application config. Throws a single aggregated
 * Error listing every missing/invalid required var on first call if invalid.
 */
export function getConfig(): AppConfig {
  if (cached) return cached;
  cached = loadConfig();
  return cached;
}

export function isEmailConfigured(): boolean {
  return getConfig().email !== null;
}

export function isTiktokConfigured(): boolean {
  return getConfig().tiktok !== null;
}

export function isLinkedinConfigured(): boolean {
  return getConfig().linkedin !== null;
}
