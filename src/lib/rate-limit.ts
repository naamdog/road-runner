/**
 * Edge-safe, in-memory sliding-window rate limiter.
 *
 * BEST-EFFORT, PER-INSTANCE ONLY. This limiter keeps its state in a plain
 * JavaScript `Map` that lives in the memory of a single serverless / Edge
 * instance. It therefore has two important limitations:
 *
 *   1. It is NOT shared across instances. On Vercel each Edge region (and each
 *      cold-started instance) has its own Map, so the effective global limit is
 *      `limit * <number of live instances>`. It is a speed bump against abusive
 *      bursts, not a hard quota.
 *   2. State is lost whenever the instance is recycled.
 *
 * It uses NO Node-only APIs, NO database, and NO logger (pino) so it is safe to
 * import from `src/middleware.ts`, which runs on the Edge runtime.
 *
 * PRODUCTION UPGRADE PATH: swap this for a shared store such as Upstash Redis
 * (`@upstash/ratelimit` + `@upstash/redis`), which gives a single authoritative
 * counter across all instances. Keep the same `rateLimit()` signature so callers
 * do not change.
 */

interface Bucket {
  /** Epoch-ms timestamps of requests still inside the current window. */
  hits: number[];
}

const buckets = new Map<string, Bucket>();

/**
 * Sliding-window check for a single key.
 *
 * @param key       Identifier to limit on (e.g. `"auth:1.2.3.4"`). Callers
 *                  should namespace keys so different limits never collide.
 * @param limit     Max allowed requests within the window.
 * @param windowMs  Window length in milliseconds.
 * @returns `ok` (whether this request is allowed), `remaining` (requests left
 *          in the window after this one; 0 when blocked), and `retryAfterSec`
 *          (seconds until the oldest hit expires — 0 when allowed).
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  const windowStart = now - windowMs;

  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }

  // Drop hits that have aged out of the window.
  if (bucket.hits.length > 0) {
    let firstValid = 0;
    while (firstValid < bucket.hits.length && bucket.hits[firstValid] <= windowStart) {
      firstValid++;
    }
    if (firstValid > 0) {
      bucket.hits.splice(0, firstValid);
    }
  }

  if (bucket.hits.length >= limit) {
    // Blocked. The window frees up when the oldest in-window hit expires.
    const oldest = bucket.hits[0];
    const retryAfterMs = oldest + windowMs - now;
    const retryAfterSec = Math.max(1, Math.ceil(retryAfterMs / 1000));
    return { ok: false, remaining: 0, retryAfterSec };
  }

  bucket.hits.push(now);

  // Opportunistic cleanup: forget keys whose window has fully drained so the
  // Map does not grow unbounded across many distinct IPs.
  if (buckets.size > 10_000) {
    sweep(now);
  }

  return { ok: true, remaining: limit - bucket.hits.length, retryAfterSec: 0 };
}

/** Remove buckets that have no hits left after pruning. Cheap, runs rarely. */
function sweep(now: number): void {
  for (const [k, b] of buckets) {
    if (b.hits.length === 0 || b.hits[b.hits.length - 1] <= now - 60 * 60 * 1000) {
      buckets.delete(k);
    }
  }
}
