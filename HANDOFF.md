# Road Runner — Engineering Handoff

> Authoritative handoff for the next build session. Everything here is grounded in a verified code audit. **Do not invent features not described here.** Where the audit flags a gap, treat it as real.

---

## 0. Hardening Update — 2026-06-06 (personal-use build)

The §9 build order was executed (scope: **everything except billing/quotas and marketing-page rebuild** — this is a personal, single-user deployment, not a public launch). **Deployed to production and verified** (build + 65 passing tests + live smoke test).

**Package manager is `pnpm`, NOT npm** — `npm install` breaks on the pnpm store. Use `pnpm install` / `pnpm run <script>` everywhere. (The §2 `npm` commands below are wrong.)

**What changed (done + verified):**
- **Tokens encrypted at rest** — AES-256-GCM (`src/lib/crypto.ts`); OAuth callback encrypts on write; `connection` tokens migrated via `scripts/encrypt-existing-tokens.ts`. New env **`TOKEN_ENC_KEY`** (base64 32 bytes) is set in Vercel prod+dev — **back it up; losing it makes stored tokens unrecoverable.** Crypto has a legacy-plaintext passthrough for zero-downtime migration. Meta Page token no longer duplicated in plaintext `metadata`.
- **Token refresh + lifecycle** — per-platform `refresh()` (YouTube/TikTok/LinkedIn) in the publishers; `src/lib/token-refresh.ts#ensureFreshAccessToken` refreshes before expiry, persists re-encrypted tokens, flags `connection.needsReconnect` on *permanent* failures only (transient blips stay retryable). Meta Page tokens are treated as non-expiring (`accessTokenExpiresAt=null`). Token-health endpoint `GET /api/connections/[id]/health`; "needs reconnect" badge in the connections UI.
- **Dispatcher hardened** (`src/app/api/cron/dispatch/route.ts`) — claim via `SELECT … FOR UPDATE SKIP LOCKED` in a short tx (no double-claim), publish outside the lock, ±30% backoff jitter, structured logging (pino), a **reaper** that resets rows stuck in `publishing`, and a resilient finalize that won't reschedule a duplicate after a successful upload.
- **Uploads** — direct-to-Blob client uploads via `@vercel/blob` `handleUpload` (bypasses the 60s function); size-scoped tokens; `pathname` threaded through so `blobPath` is no longer a fragile url-split.
- **Data integrity** — `db.transaction` around media+post+targets and tube inserts; `post.idempotencyKey` with TOCTOU-safe dedupe; composite/partial unique indexes + FK indexes (migration `drizzle/0004_harden.sql`, applied); brand DELETE reassigns connections/posts to a fallback brand (no more orphans); atomic brand set-default.
- **Auth completeness** — dev-secret fallback removed (startup env validation in `src/lib/config.ts`); Resend wired (`src/lib/email.ts`, graceful-degrade); rate limiting (`src/middleware.ts` + `src/lib/rate-limit.ts`, edge-safe in-memory).
- **Reliability/UX** — Vitest harness (`pnpm test`, 65 tests); `fetchWithTimeout` on all publisher calls; `(app)/loading.tsx`+`error.tsx`+`global-error.tsx`; YouTube icon fix; `prefers-reduced-motion`; re-runner empty-state copy.

**Remaining MANUAL items (need you, not code):**
- **TikTok / LinkedIn** still dark — code (incl. refresh + LinkedIn URN validation) is ready; add `TIKTOK_CLIENT_KEY/SECRET` and/or `LINKEDIN_CLIENT_ID/SECRET` in Vercel to light them up. LinkedIn is realistic (~1hr, free, needs a Company Page + "Share on LinkedIn" product). TikTok keys are easy but *public* auto-posting needs TikTok's Content-Posting-API audit (private/draft only until then).
- **Resend email** — set `RESEND_API_KEY` + `EMAIL_FROM` (verified domain) to make password-reset/verification emails actually send (until then they log + no-op, never crash).
- **Email verification** — `REQUIRE_EMAIL_VERIFICATION` defaults `false` (so you can't lock yourself out). Set it `"true"` in Vercel *after* Resend is configured.
- **Rate limiter** is per-instance best-effort; swap for Upstash (`@upstash/ratelimit`) if you ever go multi-user.
- **Concurrency test** `src/lib/__tests__/dispatch-concurrency.integration.test.ts` is skipped unless `TEST_DATABASE_URL` (a disposable Postgres) is set.

**Not built (intentionally, per personal-use scope):** billing/subscriptions/quotas; marketing-page rebuild (existing pages untouched).

---

## 1. TL;DR

**Road Runner** is a focused, multi-tenant SaaS for short-form video scheduling: upload once, fan out to five platforms (YouTube Shorts, Instagram Reels, TikTok, LinkedIn, Facebook Reels) on a per-account schedule, with a minute-precision cron dispatcher and exponential-backoff retries. It bundles two adjacent surfaces: **Re-runner** (resurface + repost your top-performing videos) and **TubeRunner** (long-form YouTube with full metadata/playlists/thumbnails).

Current state in 5 bullets:

- **Core is functional end-to-end.** Short-form scheduling, cron dispatch, OAuth, brand-switching, TubeRunner, and Re-runner are all implemented; YouTube + Meta (FB/IG) are wired and have credentials in Vercel. Deployed live at https://road-runner-hazel.vercel.app.
- **Two platforms are code-complete but dark.** TikTok and LinkedIn have full OAuth + publisher + re-runner code, but their env vars are **not set** — `initiate` returns 501 and they cannot be connected or tested in prod.
- **Security debt is the headline risk.** OAuth access/refresh tokens and email verification tokens are stored **unencrypted (plaintext)** in Postgres. A DB breach exposes every connected platform account.
- **No token refresh, anywhere.** Refresh tokens are stored but never used. When access tokens expire (YouTube ~1hr, Meta ~60d, LinkedIn ~1yr), publishes fail non-retryably and users must manually reconnect.
- **Production-grade safeguards are missing:** zero tests, no rate limiting, no observability/structured logging, cron has a SELECT→UPDATE race with no row locking, `db` pool capped at `max: 1`, 5 GB uploads pushed through a 60s serverless function, no idempotency keys, no billing.

**The mandate for the ultracode session:** harden the foundation first (encrypt tokens, add refresh, add row locking + idempotency, fix the upload path, add tests + observability), *then* light up TikTok/LinkedIn + Resend, *then* build billing and richer features.

---

## 2. Live URLs & Access

| Resource | Value |
|---|---|
| **Repo** | https://github.com/naamdog/road-runner — branch `main`, 12 commits, clean tree |
| **Production** | https://road-runner-hazel.vercel.app |
| **Vercel project** | `road-runner` (org `naamdog-6775s-projects`) |
| **Local path** | `C:/Users/naamd/OneDrive/Documents/Road Runner/road-runner` |
| **Database** | Neon Postgres (single region), schema pushed |
| **Blob** | Vercel Blob enabled (`BLOB_READ_WRITE_TOKEN` auto-injected on Vercel) |

> **Path gotcha:** the project lives in a nested `road-runner/` subfolder. The parent `Road Runner/` has a **space in its name**, which breaks npm package naming and several tools. Always operate from the inner `road-runner/` directory. See §10.

### Run locally

```bash
# from the INNER road-runner folder (not "Road Runner")
cd "C:/Users/naamd/OneDrive/Documents/Road Runner/road-runner"
npm install
# create .env.local from .env.example and fill the keys (see §7)
npm run dev          # Next.js dev server on http://localhost:3000
```

- **DB must be pushed before anything works.** Without `DATABASE_URL` (or against an unmigrated DB) any data access throws at runtime. Use Drizzle: `npx drizzle-kit push` (schema) — migrations live in `drizzle/`.
- **Cron does not fire on localhost.** Trigger it manually: `curl http://localhost:3000/api/cron/dispatch` (the route checks a Bearer `CRON_SECRET` — pass `Authorization: Bearer <CRON_SECRET>` if set).
- **Blob in local dev** requires a real `BLOB_READ_WRITE_TOKEN` from the Vercel dashboard (it is only auto-injected in the Vercel runtime).

### Deploy

- Push to `main` on GitHub → Vercel auto-builds and deploys the `road-runner` project.
- Vercel Cron is declared in `vercel.json` (every-minute cadence) and is registered automatically on deploy. It only runs in the deployed environment.
- Env vars are managed in the Vercel project settings (Production + Development scopes). Use the CLI pattern in §7 to add the missing keys.

---

## 3. Architecture Overview

**Stack:** Next.js 16 (App Router) · TypeScript strict · Tailwind v4 (`@tailwindcss/postcss`) · React 19 · Better Auth (email+password only) · Drizzle ORM + Neon Postgres · Vercel Blob (video storage) · Vercel Cron (every minute) · next-themes · Radix UI / shadcn-style primitives.

### Request flow (short-form happy path)

```
Browser
  │  1. Upload video  → POST /api/upload  → Vercel Blob (put)  → blob URL
  │  2. Compose+schedule → POST /api/posts
  │        creates: media row  +  post row  +  N post_target rows (one per platform/account)
  │        each post_target: status=scheduled, scheduledAt, optional caption override
  ▼
Vercel Cron (every minute) → GET /api/cron/dispatch  (Bearer CRON_SECRET)
  │  SELECT post_targets WHERE status=scheduled AND scheduledAt<=now  (BATCH_SIZE=10)
  │  mark publishing  →  publishers[platform].publish(...)  →  platform API
  │  on success: status=published, publishedUrl
  │  on failure: retryable? → schedule next attempt (exp backoff) : status=failed, lastError
  ▼
Dashboard / Scheduled view reflect status + publishedUrl
```

There are **two parallel content streams** sharing the same cron and connection model:

- **Short-form** (`post` → `post_target`): one post fans out to many targets (multi-platform). Handled by `processShortForm` in the dispatcher.
- **Long-form / TubeRunner** (`tube_post`): YouTube-only, single-platform, rich metadata. Handled by `processTubeRunner` in the dispatcher (note: its backoff math differs from short-form — see §8/§10).

### The cron model

- Single endpoint `src/app/api/cron/dispatch/route.ts`, invoked every minute by Vercel Cron.
- Auth = a single Bearer token (`CRON_SECRET`) in the `Authorization` header. No per-user/IP throttling.
- Processes up to **10 items per invocation** (`BATCH_SIZE=10`) across both streams.
- Retry: up to **3 attempts**, exponential backoff. Short-form: `2^attempts * 60s` capped at **15 min**. Tube: `2^attempts * 2 * 60s` capped at **30 min**. No jitter.
- `lastError` truncated to 1000 chars; retryable vs terminal errors distinguished via `PublisherError.retryable`.
- **Known weakness:** SELECT then UPDATE with no row lock → two overlapping cron runs can both claim the same target and double-publish. Relies on publishers being idempotent (they aren't guaranteed to be). Fix = `SELECT ... FOR UPDATE` inside a transaction + idempotency keys (§9).

### Multi-tenant / brand model

- Hierarchy: **`user` → `brand` → `connection` / `post` / `tube_post`**. `user_id` enforces tenant isolation everywhere.
- Each user gets a **default brand** on signup, created with a deterministic id `default_<userId>` + `onConflictDoNothing` to make parallel first-visit inserts idempotent (the "brand race-fix" — see §10).
- **Active brand** is held in an httpOnly cookie `rr_active_brand` (1-year maxAge). Resolution chain: **cookie → default → first**. This chain is duplicated in 5+ places and has no centralized helper or staleness validation (a cookie can point at a deleted brand).
- Connections are scoped to a brand. **Meta is special:** one OAuth connect fans out into one `connection` per managed Facebook Page, and one per linked Instagram Business account (page-token architecture — see §6/§10).

---

## 4. Data Model

ORM: Drizzle with **snake_case enforced at the ORM layer** (`src/lib/db/index.ts`), TS camelCase ↔ DB snake_case. All PKs are `text` UUIDs. All timestamps are `timestamp with time zone`. Migrations `0000`–`0003` in `drizzle/`.

**Enums:** `platform` (5 values: youtube, instagram, tiktok, linkedin, facebook) · `post_status` (6 values: e.g. scheduled, publishing, published, failed, …) · `tube_post_visibility` (3 values: public/unlisted/private).

### Tables & relationships

| Table | Purpose | Key columns | FKs / onDelete |
|---|---|---|---|
| `user` | Account root | id, email, name, **timezone** (display pref) | — |
| `session` | Better Auth sessions | id, userId, token, ipAddress, userAgent, expiresAt | userId → user **cascade** |
| `account` | Better Auth credential/provider rows | id, userId, **access_token, refresh_token, id_token** (⚠ plaintext), password hash | userId → user **cascade** |
| `verification` | Email/reset tokens | id, identifier, **value** (⚠ plaintext token), expiresAt | — |
| `brand` | Tenant identity | id (`default_<userId>` for default), userId, name, color, **is_default**, sortOrder | userId → user **cascade** |
| `connection` | A connected social account/page | id, userId, **brandId**, platform, **access_token, refresh_token** (⚠ plaintext), accessTokenExpiresAt, isActive, **metadata** (JSON: channelId/pageId/igUserId/urn) | userId **cascade**; **brandId → brand cascade** |
| `media` | Uploaded video asset | id, userId, blob URL/path, size, etc. | userId → user (cascade) |
| `post` | Short-form post (fan-out parent) | id, userId, **brandId**, caption, mediaId | userId cascade; **brandId → brand set null** |
| `post_target` | One platform/account target of a post | id, postId, **connectionId** (nullable), **platform** (⚠ duplicates connection.platform), scheduledAt, status, caption override, **attempts, lastAttemptAt, nextAttemptAt, lastError** | postId → post cascade; connectionId → connection (nullable; set null on disconnect) |
| `tube_post` | Long-form YouTube post | id, userId, **brandId**, **connectionId** (nullable), title(100), description(5000), **tags** (JSON, 50×60ch), category, visibility, madeForKids, thumbnail, **playlistId**, scheduledAt, status, attempts/backoff cols | userId cascade; **brandId → brand set null**; connectionId nullable |

**Indexes present:** `user_id`, `brand_id`, `post_id`, `scheduled_at`, `status` (named `user_idx`, `brand_idx`, `status_idx`, `scheduled_idx`); unique constraints prevent duplicate accounts.

**Retry/backoff infra** lives on `post_target` and `tube_post`: `attempts`, `last_attempt_at`, `next_attempt_at`, `last_error`.

**Schema evolution:** `brand` was added post-hoc (0001-ish), `playlist_id` added to `tube_post` later (0003). Maintain Drizzle naming conventions for future migrations.

### Data-layer gaps (carry into §8)

- ⚠ **Plaintext secrets:** `account.access_token/refresh_token/id_token`, `connection.access_token/refresh_token`, `verification.value`.
- **Missing composite unique** on `post_target (post_id, connection_id[, scheduled_at])` → same post can be scheduled twice to the same account → duplicate publishes.
- **Missing indexes** on nullable FKs `post_target.connection_id` and `tube_post.connection_id` → deleting a connection forces a full scan to find orphans.
- **Missing unique** on `brand (user_id, is_default=true)` → "get default brand" relies on app-layer enforcement / full scan.
- **Inconsistent cascade:** `connection.brand_id` **cascades** but `post.brand_id` / `tube_post.brand_id` **set null** — undocumented; orphaned content on brand delete.
- **No JSON validation** on `connection.metadata` / `tube_post.tags` (Postgres won't enforce shape).
- **Redundant** `post_target.platform` duplicates `connection.platform` with no CHECK constraint.

---

## 5. Feature Status

| Feature | Status | One-liner |
|---|---|---|
| Auth (email+password, sessions) | **SHIP-READY** | Better Auth, 30-day sessions w/ daily refresh, route-protected `(app)` layout. Email *verification* off; password-reset emails non-functional (no Resend). |
| Short-form scheduling | **SHIP-READY** | Compose → multi-account schedule → cron dispatch → retry. Race + idempotency gaps under load. |
| Cron publishing | **SHIP-READY** | Minute cadence, exp backoff, status persistence. No row locking / observability. |
| TubeRunner (long-form YT) | **SHIP-READY** | Full metadata, tags, category, visibility, made-for-kids, thumbnail, playlist, resumable upload, chapter detection, preflight panel. |
| Brands (multi-tenant) | **SHIP-READY** | Default-on-signup, per-brand connections, rename/color/default/delete, active-brand cookie. Orphan-on-delete bug. |
| Connections / OAuth (YouTube) | **SHIP-READY** | Full OAuth + resumable publisher; creds set. |
| Connections / OAuth (Meta FB+IG) | **SHIP-READY** | Long-lived token exchange, page-token model, one connection per Page / IG account; creds set. |
| Connections / OAuth (TikTok) | **NEEDS-WORK** | Code complete (PKCE) but **env vars missing** → 501. Also sandbox/audit limits (UNLISTED-only until audited). |
| Connections / OAuth (LinkedIn) | **NEEDS-WORK** | Code complete but **env vars missing** → 501. URN metadata must be present or publish fails non-retryably. |
| Re-runner | **NEEDS-WORK** | IG/FB auto-download tested; YT/TT/LI manual-only; TikTok/LinkedIn fetchers effectively **stubs** (return `[]`). UX split between instant vs manual is jarring. |
| Dashboard & analytics | **SHIP-READY** | Stats cards (scheduled, published 7d/30d, connected accounts), upcoming + recently-published, per-account status. |
| Theme / UI / design system | **SHIP-READY** | Lime-on-near-black brand, light/dark/system, command palette (Cmd+K + G-shortcuts), responsive shell. |
| Marketing pages (landing/privacy/terms) | **SHIP-READY** | `(marketing)/` route group **exists & functional**: full landing (hero/features/pricing/CTA), `/privacy`, `/terms`, marketing layout. (The audit's frontend pass missed the parenthesized route group — they are present; could use copy polish, not rebuilding.) |
| Loading / error boundaries | **DEMO-ONLY** | No `loading.tsx` / `error.tsx` anywhere; only a branded 404. No 5xx page. |
| Password reset / transactional email | **DEMO-ONLY** | Flow exists in UI but **no Resend wiring / key** → fails silently. |
| Billing / subscriptions | **MISSING** | No schema, no Stripe, no quotas/tiers. |
| Tests / CI | **MISSING** | Zero test files, no runner in `package.json`, no CI. |

---

## 6. Platform Integration Matrix

OAuth (HMAC-SHA256 signed state, 10-min expiry; PKCE for TikTok). Publishers in `src/lib/publishers/`. Re-runner fetchers in `src/lib/rerunner/`.

| Platform | OAuth wired? | Publisher real? | Re-runner fetcher | Env set (Vercel)? | Testable today? | Notes |
|---|---|---|---|---|---|---|
| **YouTube (Shorts)** | ✅ | ✅ resumable upload + metadata | ✅ but `videoUrl=null` → manual re-run | ✅ `GOOGLE_CLIENT_ID/SECRET` | ✅ | Access token ~1hr → **needs refresh** (not implemented). |
| **YouTube (Long / TubeRunner)** | ✅ | ✅ resumable + thumbnail (verified-channel only, best-effort) + playlist append (best-effort) | n/a | ✅ | ✅ | Thumbnail/playlist failures silently swallowed. |
| **Instagram (Reels)** | ✅ (via Meta) | ✅ container upload + 5-min polling | ✅ auto-download (`media_url`); views need separate `/insights` (not impl) | ✅ `META_CLIENT_ID/SECRET` | ✅ | Page-token architecture; polling can time out yet return success w/ null URL. |
| **Facebook (Reels)** | ✅ (via Meta) | ✅ 3-phase start/transfer/finish + page token | ✅ auto-download (`source`); per-video views best-effort | ✅ `META_CLIENT_ID/SECRET` | ✅ | Long-lived user token exchanged before fetching Pages. |
| **TikTok** | ✅ code (PKCE, httpOnly cookie) | ✅ code; 5-min polling | ⚠ stub → `[]` (scope `video.list` often not granted) | ❌ `TIKTOK_CLIENT_KEY/SECRET` **missing** | ❌ (501) | Unaudited apps only get `video.upload` (UNLISTED); public posting needs app audit. |
| **LinkedIn** | ✅ code | ✅ code | ⚠ stub → `[]` (no individual video API; Company Page future work) | ❌ `LINKEDIN_CLIENT_ID/SECRET` **missing** | ❌ (501) | Requires `metadata.urn`; missing URN = non-retryable publish error → manual reconnect. |

**Cross-cutting integration facts:**
- **Token refresh: not implemented for any platform.** Refresh tokens stored, never used. Expiry (`accessTokenExpiresAt`) stored but **never checked** before publish.
- **Tokens are plaintext at rest** (`connection.access_token/refresh_token`).
- **No request timeouts** on `fetch()` to platform APIs → publishers can hang.
- IG/TikTok use **polling, not webhooks** (timeout race risk).
- Connection `metadata` carries platform-specific keys: `channelId` (YT), `pageId` (FB), `igUserId` (IG), `urn` (LinkedIn).

---

## 7. Environment & Setup State

### Done
- DB schema **pushed to Neon**; Blob **enabled**; YouTube + Meta (FB/IG) OAuth apps **configured** with redirect URIs registered.
- Env set in Vercel (**Production + Development**): `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `CRON_SECRET`, `BLOB_READ_WRITE_TOKEN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `META_CLIENT_ID`, `META_CLIENT_SECRET`.

### Remaining keys to add
| Var | Unblocks | Source |
|---|---|---|
| `TIKTOK_CLIENT_KEY` | TikTok OAuth/connect/publish | TikTok for Developers app |
| `TIKTOK_CLIENT_SECRET` | ″ | ″ (also verify **app audit** status for public posting) |
| `LINKEDIN_CLIENT_ID` | LinkedIn OAuth/connect/publish | LinkedIn Developer app |
| `LINKEDIN_CLIENT_SECRET` | ″ | ″ |
| `RESEND_API_KEY` | Password-reset + transactional email | Resend dashboard |
| `EMAIL_FROM` | From-address for Resend | Your verified sending domain |

### CLI pattern to add them
```bash
# add to both scopes (run twice or repeat per env)
vercel env add TIKTOK_CLIENT_KEY production
vercel env add TIKTOK_CLIENT_KEY development
vercel env add TIKTOK_CLIENT_SECRET production
vercel env add TIKTOK_CLIENT_SECRET development
vercel env add LINKEDIN_CLIENT_ID production
vercel env add LINKEDIN_CLIENT_ID development
vercel env add LINKEDIN_CLIENT_SECRET production
vercel env add LINKEDIN_CLIENT_SECRET development
vercel env add RESEND_API_KEY production
vercel env add RESEND_API_KEY development
vercel env add EMAIL_FROM production
vercel env add EMAIL_FROM development
# pull into local for dev
vercel env pull .env.local
```
> Also generate a strong `BETTER_AUTH_SECRET` if regenerating: `openssl rand -hex 32`. **Remove the dev-secret fallback in code** (see §8/§10) so a missing secret fails loudly instead of leaking sessions.

---

## 8. Known Gaps & Tech Debt (Prioritized)

### HIGH
| Area | Gap | Where |
|---|---|---|
| Security | **OAuth + verification tokens stored plaintext.** DB breach = all platform creds + email tokens. | `connection.access_token/refresh_token`, `account.access_token/refresh_token/id_token`, `verification.value` |
| Integrations | **No token refresh** for any platform; expiry never checked before publish → publishes fail non-retryably after expiry. | `src/app/api/cron/dispatch/route.ts`, all `src/lib/publishers/*` |
| Concurrency | **Cron race:** SELECT→UPDATE with no row lock; overlapping runs double-claim a target → **double publish**. | `dispatch/route.ts` (processShortForm ~44–80, processTubeRunner ~170–208) |
| Concurrency | **No idempotency keys** on POST `/api/posts`, `/api/tube/posts`; client retries create duplicate posts/targets. | `src/app/api/posts/route.ts` |
| Data integrity | **Missing composite unique** on `post_target (post_id, connection_id)` → duplicate target rows. | `schema.ts` |
| Uploads | **5 GB upload through a 60s serverless function** → large files timeout (and front-end says 1 GB, back-end allows 5 GB). | `src/app/api/upload/route.ts`, `compose-form.tsx` |
| Auth/email | **Password-reset emails non-functional** (no Resend wiring/key); blocks any user-facing launch. | `src/lib/auth.ts`, reset pages |
| Auth | **Dev secret fallback** `'dev-secret-change-me-32-bytes-min'` leaks prod sessions if `BETTER_AUTH_SECRET` missing. | `src/lib/auth.ts`, `src/lib/oauth-state.ts` |
| Auth | **No rate limiting** on `/api/auth/**` (sign-up/login/forget/reset) or any API route. | middleware (absent) |
| Reliability | **No tests** (0% coverage) and **no observability** (errors only as truncated `lastError` strings). | whole repo |
| DB | **Connection pool `max: 1`** in dev *and* prod → hard concurrency ceiling. | `src/lib/db/index.ts` |
| UX shell | **No `loading.tsx` / `error.tsx`** anywhere (only a branded 404; no 5xx page). | `src/app/**` |
| Brands | **Brand delete orphans** connections/posts; reassign logic only runs on first-insert, not on DELETE. | `src/app/api/brands/[id]/route.ts` |
| Re-runner | TikTok/LinkedIn fetchers silently return `[]` (scope/API limits); user sees empty feed with no explanation. | `src/lib/rerunner/tiktok.ts`, `linkedin.ts` |
| UI bug | **YouTube PlatformIcon hardcodes dark fill** (`#0a0a0b`) → invisible on dark bg. | `src/components/platform-icon.tsx` |

### MEDIUM
| Area | Gap | Where |
|---|---|---|
| Integrations | TikTok/LinkedIn **env vars missing** in Vercel (code ready, can't test). | Vercel settings |
| Integrations | IG/TikTok **polling timeouts** can return success with `publishedUrl=null`. | `instagram.ts`, `tiktok.ts` |
| Integrations | Meta long-lived token exchange **silently falls back** to short-lived (1–2h) on failure, no alert. | oauth callback |
| Data | Missing indexes on nullable FKs `post_target.connection_id`, `tube_post.connection_id`. | `schema.ts` |
| Data | No unique on `brand (user_id, is_default)`. | `schema.ts` |
| Data | Inconsistent onDelete (connection cascade vs post/tube set null), undocumented. | `schema.ts` |
| Tx safety | No transaction across media+post+post_target inserts → orphaned rows on partial failure. | `posts/route.ts` |
| Cron | **No backoff jitter** → thundering herd on synchronized failures. | `dispatch/route.ts` |
| Cron | `BATCH_SIZE=10`/min ceiling (~600/hr) → backlog can grow unbounded. | `dispatch/route.ts` |
| Auth | No session invalidation on password change; no audit log; CSRF only via SameSite (unverified); reset-token TTL unverified; email not editable. | auth + settings |
| Net | No `fetch()` timeouts to platforms. | all publishers |
| UI a11y | No `prefers-reduced-motion`; sparse aria-labels; brand-switcher pending state has no spinner; mobile nav can overflow. | globals.css, components |

### LOW
| Area | Gap |
|---|---|
| Data | `post_target.platform` duplicates `connection.platform` (no CHECK); JSON cols unvalidated. |
| Cron | Short-form vs tube backoff inconsistent (15 vs 30 min cap). |
| Posts | Fragile `blobPath` extraction via `url.split('/').slice(-2)`. |
| Re-runner | No cross-platform dedup; Library hides posts with `publishedCount=0`; IG views not fetched. |
| Brands | No drag-to-reorder UI (`sortOrder` only set on create); stale active-brand cookie not validated. |
| TubeRunner | Chapter regex brittle; no auto-transcode; thumbnail progress bar absent; playlist/thumbnail failures silent. |
| Auth | No account lockout; no magic-link fallback; weak-password complexity not enforced (min 8). |
| Infra | Single-region Neon; no env-var validation at startup; Blob token is a single shared secret. |
| UI | Logo color `#CCFF00` hardcoded (not DRY); platform colors static in light mode; favicon only SVG; no component tests. |

---

## 9. Recommended Build Order (for the ultracode session)

**Principle: harden the money-and-trust paths before adding surface area.** Publishing on behalf of users with plaintext, never-refreshed tokens and double-publish races is the existential risk — fix that first.

### Phase 0 — Safety net (do before touching anything else)
1. **Add a test runner** (Vitest + Testing Library + a fetch mock). Wire `test`/`test:watch` scripts in `package.json`. No coverage target yet — just make tests runnable so the hardening work below is verifiable.
2. **Startup env validation** (a `config.ts` that throws on missing `DATABASE_URL`, `BETTER_AUTH_SECRET`, `NEXT_PUBLIC_APP_URL`, platform creds). **Remove the dev-secret fallback** in `auth.ts` + `oauth-state.ts`.

### Phase 1 — Token security & lifecycle (highest leverage)
3. **Encrypt tokens at rest.** AES-256-GCM via `node:crypto` (or libsodium); key from a new `TOKEN_ENC_KEY` env. Encrypt on write, decrypt before passing to publishers. Migrate existing `connection`/`account` rows. Cover `verification.value` too.
4. **Implement per-platform `refresh()`** (YouTube refresh grant; Meta already long-lived but re-exchange path; LinkedIn `POST /oauth/v2/accessToken`; TikTok `POST /v2/oauth/token`). In the dispatcher, **check `accessTokenExpiresAt` and refresh before every publish**; on refresh failure mark connection `needs_reconnect` and surface in UI.
5. **Token health endpoint** `GET /api/connections/[id]/health` + stale-token badges in the connections UI.

### Phase 2 — Publish correctness & durability
6. **Cron row locking:** wrap claim logic in `db.transaction()` with `SELECT ... FOR UPDATE SKIP LOCKED`. Add a **composite unique** on `post_target (post_id, connection_id)` and **idempotency keys** (e.g. `postTarget.id + attempt`) to make double-publish impossible.
7. **Add `fetch()` timeouts** (AbortController, 5–30s) to all publishers; classify timeouts as retryable.
8. **Backoff jitter** (±30%); unify short-form vs tube backoff or document the difference.
9. **Transaction** around media+post+post_target creation.
10. **Observability:** structured logging (pino) to an external sink (Sentry/Datadog/Logtail) with userId+connectionId+status+trace on every publish; counters for attempted/succeeded/failed/retried; alerts on >10% failure rate, cron latency, queue backlog. Stop swallowing thumbnail/playlist/long-lived-token errors silently.

### Phase 3 — Uploads & DB capacity
11. **Fix the upload path:** switch to **Vercel Blob client SDK / presigned uploads** so the browser uploads directly (bypassing the 60s function). Align size limits (e.g. 1 GB shorts / 5 GB long-form) front- and back-end. Add **server-side size validation**.
12. **Raise DB pool** to `max: 10–20`; monitor utilization.

### Phase 4 — Auth completeness
13. **Wire Resend** into Better Auth's email handler; test password-reset end-to-end. Then **enable `requireEmailVerification`**.
14. **Rate limiting** middleware for `/api/auth/**` and write endpoints (Upstash Redis or `rate-limiter-flexible`): e.g. 5 sign-ups/IP/hr, 10 logins/account/hr, 3 forgot-password/email/hr, 10 posts/min/user.
15. **Session invalidation on password change**, **auth audit log** table, explicit **CSRF**, editable email.

### Phase 5 — Light up the dark platforms
16. Add **TikTok + LinkedIn** env vars (§7); validate LinkedIn **URN at callback** (fail fast); track TikTok **audit status** and gate public posting. Replace IG/TikTok polling with **webhooks** (`src/app/api/webhooks/`).

### Phase 6 — Brand & data hygiene
17. **Cascade/cleanup on brand delete** (reassign or cascade connections/posts); add the **`brand (user_id, is_default)` unique** and the **nullable-FK indexes**; centralize active-brand resolution into one helper with staleness validation.

### Phase 7 — Monetization & polish
18. **Billing:** subscriptions + usage tables, Stripe/Paddle, tiers (free / pro / enterprise) with quotas (posts/month, brands, storage). Enforce quotas in compose/upload.
19. **App-shell UX:** `loading.tsx` + `error.tsx` boundaries, polish the **existing** marketing pages (landing/privacy/terms already present), empty states, `prefers-reduced-motion`, a11y labels, fix the **YouTube icon fill** bug, favicon rasters.
20. **Re-runner UX:** unify instant-vs-manual flow, explain empty TikTok/LinkedIn feeds, fetch IG views, dedup.
21. Broaden tests to 70%+ on auth/publishing/cron critical paths; add CI.

---

## 10. Gotchas & Conventions

- **Space in the parent path.** The repo sits in `…/Road Runner/road-runner/`. The outer `Road Runner` has a space that breaks npm package naming and some tooling — that's *why* the project is nested. Always work in the inner folder; quote paths in shells.
- **snake_case at the ORM boundary.** `src/lib/db/index.ts` configures Drizzle to map TS camelCase → DB snake_case automatically. Keep all new columns consistent; don't hand-write snake_case in TS.
- **Meta page-token model.** Connecting Facebook exchanges a long-lived **user** token, then fetches all managed **Pages** and stores a **per-Page** token as separate `connection` rows; Instagram Business accounts linked to those Pages each become their own connection too. Publishers use the **page** token, not the user token. The long-lived exchange has a **silent short-lived fallback** — add logging there.
- **Sign-up hard-navigation.** After `signUp()`, the client explicitly calls `signIn()` then **`window.location.assign()`** (full reload) instead of `router.push()`. This masks a session-cookie race rather than fixing it — investigate the root cause before relying on SPA navigation post-signup.
- **Brand race-fix pattern.** Default brand is inserted with a deterministic id `default_<userId>` + `onConflictDoNothing`, making concurrent first-visit inserts idempotent. Reuse this deterministic-id-on-conflict pattern for any other "create-on-first-visit" singletons.
- **Active-brand resolution** (`cookie rr_active_brand → default → first`) is **copy-pasted in 5+ places** with no staleness check. Extract a single helper and validate the brandId still exists.
- **Cookie prefix `rr`.** Better Auth cookies use the `rr` prefix, httpOnly, SameSite=lax.
- **Cron determinism / workflow note.** The dispatcher is the single source of publish truth; it is **not idempotent yet** and has a claim race. Treat any change to claim/lock/retry logic as load-bearing — write a test that simulates two simultaneous invocations and asserts a single publish.
- **Two different backoff formulas.** Short-form caps at 15 min (`2^n·60s`); TubeRunner caps at 30 min (`2^n·2·60s`). Don't assume they share code.
- **Upload size mismatch is intentional-looking but isn't.** UI says 1 GB, server allows 5 GB — pick one story per stream and enforce on both ends.
- **Re-runner auto-download matrix.** IG (`media_url`) + FB (`source`) → `canAutoDownload=true`, downloaded to Blob for instant re-run. YT/TT/LI → `videoUrl=null` by design → "re-run manually" path navigates to `/compose` with caption pre-filled. TikTok's `video.list` scope is frequently ungranted, so the fetcher returns `[]` on 401/403 (silent empty feed).
- **TubeRunner chapters** are emitted as `HH:MM:SS`/`MM:SS` lines in the description for YouTube to auto-detect; nothing sets chapters via API. Regex requires start at `00:00`, ascending; brittle to odd formats.
- **TubeRunner presets:** category `22` (People & Blogs), visibility `public`, `scheduledAt` = tomorrow 10:00 local (user timezone from session). Preflight has ~11 checks; `missing` blocks submit, `warn` is advisory.
- **Brand colors** come from a `BRAND_COLORS` palette with auto-next-color; rendered as inline styles (safe, avoids Tailwind purge issues).
- **CRON auth** is a single Bearer (`CRON_SECRET`). Anyone with it can trigger unlimited dispatch — add per-caller throttling when you add rate limiting.
- **Logo/brand rule (do not violate):** electric lime **#CCFF00** on near-black **#0A0A0B**; the mark is **two leaning slashes** (motion). **Never** depict a road, a runner, or a bird. Logo color is currently hardcoded in SVGs — refactor to `--color-brand` but keep the exact hex.

---

## 11. File Map

```
road-runner/
├─ vercel.json                         # Vercel Cron (every-minute) → /api/cron/dispatch
├─ package.json                        # Next 16, React 19, Drizzle, Better Auth, Resend(installed, unused). NO test script.
├─ tsconfig.json                       # strict: true, target ES2017
├─ postcss.config.mjs                  # @tailwindcss/postcss (Tailwind v4)
├─ .env.example                        # full env list incl. unset TikTok/LinkedIn/Resend
├─ drizzle/                            # migrations 0000–0003 + meta/ snapshots
│  └─ meta/0003_snapshot.json
└─ src/
   ├─ lib/
   │  ├─ auth.ts                       # Better Auth config (⚠ dev-secret fallback, requireEmailVerification:false, no email handler)
   │  ├─ oauth-config.ts               # per-platform scopes / endpoints / client env mapping
   │  ├─ oauth-state.ts                # HMAC-SHA256 signed state, 10-min expiry (⚠ shares dev-secret fallback)
   │  ├─ active-brand.ts               # active-brand cookie helpers (⚠ no staleness validation)
   │  ├─ db/
   │  │  ├─ index.ts                   # Drizzle client; snake_case mapping; ⚠ pool max:1
   │  │  └─ schema.ts                  # ALL tables + enums (see §4); ⚠ plaintext tokens, missing constraints/indexes
   │  ├─ publishers/                   # one file per platform + shared types/registry
   │  │  ├─ types.ts                   # PublisherError(retryable), Publisher interface
   │  │  ├─ index.ts                   # platform → publisher registry
   │  │  ├─ youtube.ts                 # Shorts: resumable upload + metadata
   │  │  ├─ youtube-longform.ts        # long-form + thumbnail + playlist (best-effort, silent fail)
   │  │  ├─ instagram.ts               # container upload + 5-min polling
   │  │  ├─ facebook.ts                # 3-phase start/transfer/finish + page token
   │  │  ├─ tiktok.ts                  # PKCE; UNLISTED until app audit; 5-min polling
   │  │  └─ linkedin.ts                # requires metadata.urn (else non-retryable)
   │  └─ rerunner/                     # fetchers returning PopularVideo[]
   │     ├─ instagram.ts               # auto-download (media_url); views not fetched
   │     ├─ facebook.ts                # auto-download (source); per-video views best-effort
   │     ├─ youtube.ts                 # videoUrl=null → manual re-run
   │     ├─ tiktok.ts                  # ⚠ stub → [] (scope risk)
   │     └─ linkedin.ts                # ⚠ stub → [] (no individual video API)
   ├─ app/
   │  ├─ layout.tsx                    # root layout, theme, metadata, favicon (SVG only)
   │  ├─ globals.css                   # Tailwind v4 @theme, brand tokens, animations (⚠ no reduced-motion)
   │  ├─ not-found.tsx                 # branded 404 (only error page that exists)
   │  ├─ sitemap.ts / robots.ts / manifest.ts / opengraph-image.tsx
   │  ├─ (auth)/                       # login / sign-up / reset / reset/confirm (⚠ reset email non-functional)
   │  ├─ (marketing)/                  # landing (hero/features/pricing/CTA) + privacy + terms + layout — EXISTS, functional
   │  ├─ (app)/                        # session-guarded shell (route protection at layout level)
   │  │  ├─ compose/                   # short-form compose-form (multi-account schedule, ⚠ 1GB client cap)
   │  │  ├─ scheduled/                 # post list + status + manual retry
   │  │  ├─ re-runner/                 # popularity grid + library tab + rerun flows
   │  │  ├─ tube/compose/              # TubeRunner form (metadata, chapters, preflight, resumable XHR upload)
   │  │  ├─ brands/                    # brands-manager (rename/color/default/delete; no reorder)
   │  │  └─ connections/ , settings/   # brand-aware connections; settings-forms (⚠ no session-invalidate on pw change)
   │  └─ api/
   │     ├─ auth/[...all]/route.ts     # Better Auth handler (⚠ no rate limiting)
   │     ├─ oauth/[platform]/initiate  # 501 if env missing (TikTok/LinkedIn)
   │     ├─ oauth/[platform]/callback  # token exchange; Meta page fan-out; ⚠ silent short-lived fallback
   │     ├─ upload/route.ts            # ⚠ 5GB through 60s serverless; no server-side size check
   │     ├─ posts/route.ts             # create post+targets (⚠ no tx, no idempotency, fragile blobPath)
   │     ├─ posts/targets/[id]/        # edit + retry
   │     ├─ tube/posts/route.ts        # create tube_post
   │     ├─ brands/[id]/route.ts       # ⚠ DELETE orphans connections/posts
   │     └─ cron/dispatch/route.ts     # THE dispatcher (⚠ race, no jitter, BATCH_SIZE=10, ignores token expiry)
   └─ components/
      ├─ app-shell.tsx, sidebar.tsx, mobile-nav.tsx, user-menu.tsx
      ├─ brand-switcher.tsx            # ⚠ pending state = opacity only
      ├─ command-palette.tsx           # Cmd+K + G-shortcuts
      ├─ logo.tsx                      # two-slash mark (⚠ hardcoded #CCFF00)
      ├─ platform-icon.tsx             # ⚠ YouTube fill hardcoded dark
      ├─ theme-provider.tsx, theme-toggle.tsx
      └─ ui/                           # ~20 shadcn-style primitives (button, card, dialog, …)
```

---

*End of handoff. When in doubt, prefer the audit findings over assumptions, and write a test before changing the dispatcher.*
