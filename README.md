# Road Runner

> **Schedule once. Run everywhere.**

A focused, beautiful scheduler for short-form video — one piece of content,
five platforms (YouTube Shorts, Instagram Reels, TikTok, LinkedIn, Facebook
Page Reels), five different times. Nothing else.

---

## Stack

- **Next.js 16** App Router · TypeScript · Tailwind v4
- **Better Auth** — email + password (no third-party OAuth for the app itself)
- **Drizzle ORM + Neon Postgres** — serverless DB
- **Vercel Blob** — video storage
- **Vercel Cron** — minute-precision scheduling
- **Resend** — transactional email (optional)

## Quick start

### 1. Install

```bash
pnpm install
```

### 2. Configure environment

Copy `.env.example` to `.env.local` and fill in:

```bash
cp .env.example .env.local
```

At minimum, you need:

| Variable                | Source                                                            |
| ----------------------- | ----------------------------------------------------------------- |
| `DATABASE_URL`          | [neon.tech](https://neon.tech) — free tier is plenty              |
| `BETTER_AUTH_SECRET`    | `openssl rand -hex 32`                                            |
| `BLOB_READ_WRITE_TOKEN` | Auto-set on Vercel; for local, grab from Vercel dashboard         |
| `CRON_SECRET`           | `openssl rand -hex 32`                                            |

Platform OAuth credentials (for posting) are optional during development but
required to actually publish:

- **YouTube** — Google Cloud Console, enable YouTube Data API v3
- **Instagram + Facebook** — Meta for Developers (one app covers both)
- **TikTok** — TikTok for Developers
- **LinkedIn** — LinkedIn Developer Portal

Redirect URI for each: `https://<your-domain>/api/oauth/<platform>/callback`

### 3. Push the schema

```bash
pnpm db:push
```

### 4. Start the dev server

```bash
pnpm dev
```

Open <http://localhost:3000>.

## Deploy to Vercel

1. Push the repo to GitHub.
2. Import the project on [vercel.com](https://vercel.com/new).
3. Add the env vars from `.env.example`.
4. The cron job is registered in `vercel.json` — it runs every minute.

## Architecture

```
src/
  app/
    (marketing)/        Landing
    (auth)/             Sign up · login · reset
    (app)/              Dashboard · compose · scheduled · connections · settings
    api/
      auth/[...all]     Better Auth catch-all
      upload            Video → Vercel Blob
      posts             Create scheduled posts
      oauth/[p]/...     Per-platform OAuth dance
      cron/dispatch     Vercel cron entrypoint
  components/ui/        Primitives (button, card, dialog, ...)
  lib/
    db/                 Drizzle schema + client
    auth.ts             Better Auth server config
    platforms.ts        Platform metadata
    publishers/         Per-platform publish() functions
    oauth-config.ts     Per-platform OAuth URLs + scopes
```

## How scheduling works

1. User uploads a short → stored in Vercel Blob.
2. User picks platforms + per-platform `scheduledAt`.
3. We insert one `post` row + N `post_target` rows (`status = scheduled`).
4. `vercel.json` triggers `GET /api/cron/dispatch` every minute.
5. The dispatcher picks up due rows, marks `publishing`, calls the platform's
   publisher, then marks `published` or `failed` (with exponential-backoff
   retries up to 3 attempts).

## License

MIT
