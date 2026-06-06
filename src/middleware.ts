import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Edge middleware: best-effort, per-IP rate limiting on auth and write
 * endpoints. The `config.matcher` below scopes this middleware so it runs ONLY
 * for the listed paths — every other route bypasses it entirely.
 *
 * Only POST requests are limited; GET and other methods pass straight through
 * (auth flows like the OAuth callback and session reads are GETs).
 *
 * The underlying limiter (`src/lib/rate-limit.ts`) is per-instance and
 * best-effort; see that file for the Upstash production upgrade path.
 */

const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const ONE_MIN_MS = 60 * 1000;

// Auth: sign-up / login / forgot-password etc. — any POST under /api/auth.
const AUTH_LIMIT = 10;
const AUTH_WINDOW_MS = FIFTEEN_MIN_MS;

// Write endpoints: post creation, tube post creation, uploads.
const WRITE_LIMIT = 30;
const WRITE_WINDOW_MS = ONE_MIN_MS;

function clientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    // x-forwarded-for is a comma-separated list; the first entry is the client.
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export function middleware(req: NextRequest): NextResponse {
  // Only rate-limit writes. Let GET/HEAD/OPTIONS and everything else through.
  if (req.method !== "POST") {
    return NextResponse.next();
  }

  const pathname = req.nextUrl.pathname;
  const ip = clientIp(req);

  let limit: number;
  let windowMs: number;
  let bucket: string;

  if (pathname.startsWith("/api/auth")) {
    limit = AUTH_LIMIT;
    windowMs = AUTH_WINDOW_MS;
    bucket = "auth";
  } else {
    // /api/posts, /api/tube/posts, /api/upload — all share the write budget,
    // keyed by exact path so each endpoint gets its own counter per IP.
    limit = WRITE_LIMIT;
    windowMs = WRITE_WINDOW_MS;
    bucket = `write:${pathname}`;
  }

  const { ok, retryAfterSec } = rateLimit(`${bucket}:${ip}`, limit, windowMs);

  if (!ok) {
    return new NextResponse(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
      },
    });
  }

  return NextResponse.next();
}

/**
 * Scope the middleware to exactly the sensitive endpoints. Anything not listed
 * here never invokes the middleware, so normal traffic is unaffected.
 *
 * - `/api/auth/:path*`  — Better Auth handler (sign-up, login, forgot, etc.)
 * - `/api/posts`        — create post (exact)
 * - `/api/tube/posts`   — create tube post (exact)
 * - `/api/upload`       — blob upload (exact)
 */
export const config = {
  matcher: ["/api/auth/:path*", "/api/posts", "/api/tube/posts", "/api/upload"],
};
