# Road Runner — Hardening Build: Shared Contracts

> **READ THIS FIRST.** This file is the single source of truth for the hardening build.
> Every agent must follow these exact signatures, names, and conventions so parallel work composes.
> Do **not** invent alternative names. If something here is ambiguous, prefer the literal spec.

## House rules (apply to ALL agents)

- **Working dir:** `C:/Users/naamd/OneDrive/Documents/Road Runner/road-runner` (the INNER folder). Quote paths; the parent has a space.
- **Platform:** Windows. Use the Bash tool for POSIX commands; quote paths.
- **Drizzle casing:** the client is configured with `casing: "snake_case"` (`src/lib/db/index.ts`). Write columns in **camelCase** in TS — Drizzle maps to snake_case automatically. Never hand-write snake_case column keys in TS.
- **IDs:** all PKs are `text` UUIDs generated with `nanoid()` (from `nanoid`). Timestamps are `timestamp({ withTimezone: true })`.
- **Publisher contract:** `PublishInput` / `PublishResult` / `PublisherError(message, retryable)` live in `src/lib/publishers/types.ts`. A `retryable=false` error is terminal (no retry).
- **TS strict** is on. `npm run typecheck` must stay green. Match surrounding code style (no semicheck churn).
- **Do not** touch files outside your assigned ownership list. If you need a change in another file, note it in your report under `followups` — do not edit it.
- **Secrets:** never print full secret values. When generating example env, use placeholders.
- **Tests:** Vitest. Test files live next to code in `__tests__/` or as `*.test.ts`. Use `vitest` + `@testing-library/react` (jsdom).

## Env vars (canonical list)

Required at runtime: `DATABASE_URL`, `BETTER_AUTH_SECRET` (≥32 chars), `NEXT_PUBLIC_APP_URL`, `TOKEN_ENC_KEY` (base64-encoded 32 bytes), `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `META_CLIENT_ID`, `META_CLIENT_SECRET`.
Optional: `BETTER_AUTH_URL`, `CRON_SECRET`, `BLOB_READ_WRITE_TOKEN`, `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `LINKEDIN_CLIENT_ID`, `LINKEDIN_CLIENT_SECRET`, `RESEND_API_KEY`, `EMAIL_FROM`, `REQUIRE_EMAIL_VERIFICATION` (`"true"`/`"false"`, default false), `LOG_LEVEL` (default `info`).

---

## MODULE CONTRACTS

### `src/lib/crypto.ts` (NEW)
AES-256-GCM symmetric encryption for tokens at rest. Key = 32 raw bytes decoded from base64 `TOKEN_ENC_KEY` (read via `getConfig().tokenEncKey`).

```ts
/** Encrypt a secret. Returns "enc:v1:" + base64(iv(12) | tag(16) | ciphertext). */
export function encryptSecret(plain: string): string
/** Decrypt. null -> null. A value NOT starting with "enc:v1:" is treated as
 *  legacy plaintext and returned unchanged (enables zero-downtime migration). */
export function decryptSecret(value: string | null | undefined): string | null
export function isEncrypted(value: string | null | undefined): boolean
```
- 12-byte random IV per call. GCM auth tag verified on decrypt; tampering throws.
- Unit test: round-trip, legacy-plaintext passthrough, tamper detection, null handling.

### `src/lib/config.ts` (NEW)
Zod-validated, **lazy** singleton (do NOT throw at import time — Next builds import modules without env). Validate on first `getConfig()` call; throw ONE aggregated error listing all missing/invalid required vars.

```ts
export interface AppConfig {
  databaseUrl: string; betterAuthSecret: string; appUrl: string; betterAuthUrl: string;
  tokenEncKey: Buffer;            // decoded 32 bytes
  google: { clientId: string; clientSecret: string };
  meta: { clientId: string; clientSecret: string };
  tiktok: { clientKey: string; clientSecret: string } | null;
  linkedin: { clientId: string; clientSecret: string } | null;
  cronSecret: string | null;
  email: { resendApiKey: string; from: string } | null;
  requireEmailVerification: boolean;
  logLevel: string;
}
export function getConfig(): AppConfig          // throws aggregated error if required missing
export function isEmailConfigured(): boolean
export function isTiktokConfigured(): boolean
export function isLinkedinConfigured(): boolean
```
- `tokenEncKey`: decode base64, assert exactly 32 bytes else throw.
- Keep reading `process.env` allowed elsewhere, but new code should prefer `getConfig()`.

### `src/lib/logger.ts` (NEW)
pino structured logger. No paid vendor required — log to stdout (Vercel captures). Pretty in dev.

```ts
export const logger: import("pino").Logger
export function createLogger(bindings: Record<string, unknown>): import("pino").Logger
```
- Level from `LOG_LEVEL` (default `info`). In `NODE_ENV !== "production"` use `pino-pretty` transport.
- Guard against multiple instantiation (module singleton).

### `src/lib/publishers/http.ts` (NEW)
```ts
/** fetch with an AbortController timeout. Throws PublisherError(retryable=true) named
 *  reason on timeout/abort. Default 30000ms. */
export async function fetchWithTimeout(
  url: string, init?: RequestInit, timeoutMs?: number
): Promise<Response>
```
- On `AbortError` throw `new PublisherError("Request to <host> timed out", true)`.
- Publishers must route ALL outbound `fetch()` through this.

---

## SCHEMA CHANGES — `src/lib/db/schema.ts` (one owner) + generated migration

Add to existing tables (camelCase TS keys; Drizzle maps to snake_case):

- **connection**: add
  - `needsReconnect: boolean("needs_reconnect").notNull().default(false)`
  - `lastRefreshedAt: timestamp("last_refreshed_at", { withTimezone: true })`
  - `lastRefreshError: text("last_refresh_error")`
  - new index: `index("connection_needs_reconnect_idx").on(t.needsReconnect)` (optional, cheap)
- **post**: add
  - `idempotencyKey: text("idempotency_key")`
  - partial unique: `uniqueIndex("post_user_idempotency_unq").on(t.userId, t.idempotencyKey).where(sql\`idempotency_key is not null\`)`
- **post_target**: add
  - `uniqueIndex("post_target_post_conn_unq").on(t.postId, t.connectionId)` (NULL connectionId rows stay distinct — drafts unaffected)
  - `index("post_target_connection_idx").on(t.connectionId)`
- **tube_post**: add
  - `index("tube_post_connection_idx").on(t.connectionId)`
- **brand**: add
  - partial unique: `uniqueIndex("brand_user_default_unq").on(t.userId).where(sql\`is_default\`)`

Import `sql` from `drizzle-orm` and `uniqueIndex` from `drizzle-orm/pg-core` as needed.
After editing, run `npm run db:generate -- --name harden` to emit the migration SQL into `drizzle/`. Report the generated SQL verbatim. **Do NOT run db:push** (the orchestrator applies it to the DB).

---

## TOKEN REFRESH — contracts

### `src/lib/publishers/types.ts` (add to existing)
```ts
export interface RefreshResult {
  accessToken: string;
  refreshToken?: string | null;     // some providers rotate; if absent keep existing
  accessTokenExpiresAt?: Date | null;
}
export type TokenRefresher = (input: {
  refreshToken: string;
  accessToken?: string | null;
  metadata: Record<string, unknown> | null;
}) => Promise<RefreshResult>;
```

### Per-publisher refresh exports (each publisher file adds, where supported)
- `src/lib/publishers/youtube.ts` → `export const refreshYouTube: TokenRefresher` — POST `https://oauth2.googleapis.com/token`, `grant_type=refresh_token`, `client_id/secret` from `getConfig().google`. Response `access_token`,`expires_in`. Keep same refresh token.
- `src/lib/publishers/linkedin.ts` → `export const refreshLinkedIn: TokenRefresher` — POST `https://www.linkedin.com/oauth/v2/accessToken`, `grant_type=refresh_token`, config.linkedin. (Only works if app has refresh enabled; on 400 throw non-retryable.)
- `src/lib/publishers/tiktok.ts` → `export const refreshTikTok: TokenRefresher` — POST `https://open.tiktokapis.com/v2/oauth/token/`, `grant_type=refresh_token`, `client_key`/`client_secret` config.tiktok.
- Meta (instagram/facebook): **no refresher** — Page tokens derived from a long-lived user token do not expire; document this in a comment. Do NOT add a refresher.

### `src/lib/publishers/index.ts` (add)
```ts
export const refreshers: Partial<Record<Platform, TokenRefresher>> = {
  youtube: refreshYouTube,
  linkedin: refreshLinkedIn,
  tiktok: refreshTikTok,
};
```

### `src/lib/token-refresh.ts` (NEW)
```ts
/** Decrypts tokens, refreshes if near/!past expiry, persists re-encrypted token,
 *  flips needsReconnect. Returns a usable (decrypted) access token. */
export async function ensureFreshAccessToken(conn: {
  id: string; platform: Platform;
  accessToken: string | null; refreshToken: string | null;
  accessTokenExpiresAt: Date | null; metadata: Record<string, unknown> | null;
}): Promise<string>
```
Logic:
1. `const access = decryptSecret(conn.accessToken)`; `const refresh = decryptSecret(conn.refreshToken)`.
2. If no `accessTokenExpiresAt` OR expiry is > 5 min away → return `access` (throw non-retryable if access is null).
3. Else if a `refreshers[platform]` exists AND `refresh` present → call it. On success: persist `encryptSecret(new access)`, rotated refresh if any, new `accessTokenExpiresAt`, `lastRefreshedAt=now`, `needsReconnect=false`; return new access.
4. On refresh failure OR (expired and no refresher/refresh token): set `needsReconnect=true`, `lastRefreshError=<msg>`; throw `new PublisherError("Connection needs reconnect: <platform>", false)`.

---

## INTEGRATION POINTS (Run 3 — each file one owner)

- **`src/app/api/cron/dispatch/route.ts`**: claim rows with `db.transaction(tx => tx.select(...).for("update", { skipLocked: true })...)` then mark `publishing` inside the same tx; call `ensureFreshAccessToken(conn)` before each publish (pass the decrypted token to the publisher); add ±30% jitter to backoff; structured logging via `createLogger({ scope: "cron" })` with `{ targetId, platform, status, attempt }`; stop swallowing — log thumbnail/playlist best-effort failures. Keep the two backoff caps but document them.
- **`src/lib/auth.ts`**: remove the `"dev-secret-change-me-32-bytes-min"` fallback (read `getConfig().betterAuthSecret`); add Better Auth email handlers (`emailAndPassword.sendResetPassword`, `emailVerification.sendVerificationEmail`) wired to `src/lib/email.ts`; set `requireEmailVerification: getConfig().requireEmailVerification`; keep `cookiePrefix: "rr"`.
- **`src/lib/email.ts` (NEW)**: Resend wrapper. If `!isEmailConfigured()` → log the link/subject and **return without throwing** (graceful degrade). `sendEmail({to,subject,html})`, `sendPasswordResetEmail`, `sendVerificationEmail`.
- **`src/lib/oauth-state.ts`**: remove dev-secret fallback (use `getConfig().betterAuthSecret`). Replace the `require("node:crypto")` in `codeChallenge` with a top-level import.
- **`src/lib/db/index.ts`**: raise pool to `max: 10` (prod) — keep `prepare:false`, `casing:"snake_case"`, the no-DB Proxy, and the dev global-singleton pattern.
- **`src/app/api/posts/route.ts`** (+ `tube/posts/route.ts`): wrap media+post+targets inserts in `db.transaction`; accept optional `idempotencyKey` from body and dedupe (return existing post if key seen); fix fragile `blobPath` (`url.split('/').slice(-2)`) — derive from a passed `pathname` instead.
- **`src/app/api/oauth/[platform]/callback/route.ts`**: `encryptSecret` tokens before insert/update; log (warn) when Meta long-lived exchange falls back to short-lived; for LinkedIn validate `metadata.urn` present at callback and fail fast with a clear message if absent.
- **OAuth initiate route + connect UI**: where tokens were stored plaintext, now encrypted (handled in callback). No change to initiate beyond config use.

## RATE LIMITING (Run 3)
- **`src/lib/rate-limit.ts` (NEW)**: lightweight in-memory sliding-window limiter (best-effort; document that it's per-instance and that Upstash is the production upgrade). `rateLimit(key, limit, windowMs): { ok: boolean; retryAfter?: number }`.
- **`src/middleware.ts` (NEW or extend)**: apply limits to `/api/auth/**` (sign-up 5/IP/hr, login 10/15min, forget-password 3/hr) and write endpoints (posts 10/min/user). Return 429 with `Retry-After`. Keep existing route protection working.

## UX POLISH (Run 4)
- `src/app/(app)/loading.tsx` + `src/app/(app)/error.tsx` (+ a root `error.tsx`/global-error if missing) — branded, on-theme.
- `src/components/platform-icon.tsx`: YouTube fill must use `currentColor`/`--color-brand`, not hardcoded `#0a0a0b` (invisible on dark).
- `src/app/globals.css`: add `@media (prefers-reduced-motion: reduce)` to disable/limit animations.
- Re-runner: surface a clear empty-state explaining why TikTok/LinkedIn feeds are empty (scope/API limits) instead of a blank grid.
- `src/components/connections/*` (or connections page): show a "needs reconnect" / stale-token badge driven by `connection.needsReconnect`.

## TOKEN HEALTH (Run 3)
- `src/app/api/connections/[id]/health/route.ts` (NEW): GET → `{ ok, needsReconnect, expiresAt, lastRefreshedAt }` for the owner's connection.

---

## VERIFICATION GATES (orchestrator runs between phases)
`npm run typecheck` → `npm run test` → `npm run build`. Migration applied to DB only at the prod step. Real-DB concurrency test for the dispatcher may be `describe.skip` unless `TEST_DATABASE_URL` set.
