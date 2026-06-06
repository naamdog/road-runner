import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// rate-limit.ts keeps its state in a module-level `Map`, and it reads the
// current clock via `Date.now()` internally. To keep tests isolated we:
//   - reset modules + re-import per test so each starts with an empty Map, and
//   - use fake timers so we control the clock the limiter reads.
let rateLimit: typeof import("../rate-limit").rateLimit;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  vi.resetModules();
  ({ rateLimit } = await import("../rate-limit"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("rateLimit", () => {
  it("allows exactly `limit` requests in the window, then blocks the next", () => {
    const key = "auth:1.2.3.4";
    const limit = 3;
    const windowMs = 60_000;

    // The first `limit` requests are all allowed.
    for (let i = 0; i < limit; i++) {
      const res = rateLimit(key, limit, windowMs);
      expect(res.ok).toBe(true);
    }

    // The (limit + 1)th request within the same window is blocked.
    const blocked = rateLimit(key, limit, windowMs);
    expect(blocked.ok).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("allows requests again after the window has fully elapsed", () => {
    const key = "auth:5.6.7.8";
    const limit = 2;
    const windowMs = 60_000;

    expect(rateLimit(key, limit, windowMs).ok).toBe(true);
    expect(rateLimit(key, limit, windowMs).ok).toBe(true);
    // Budget exhausted.
    expect(rateLimit(key, limit, windowMs).ok).toBe(false);

    // Advance past the window so the earlier hits age out.
    vi.advanceTimersByTime(windowMs + 1);

    const afterWindow = rateLimit(key, limit, windowMs);
    expect(afterWindow.ok).toBe(true);
    // A fresh window: this is the first of `limit` allowed hits again.
    expect(afterWindow.remaining).toBe(limit - 1);
  });

  it("gives distinct keys independent budgets", () => {
    const limit = 2;
    const windowMs = 60_000;

    // Exhaust key A entirely.
    expect(rateLimit("a", limit, windowMs).ok).toBe(true);
    expect(rateLimit("a", limit, windowMs).ok).toBe(true);
    expect(rateLimit("a", limit, windowMs).ok).toBe(false);

    // Key B is unaffected by key A's exhausted budget.
    expect(rateLimit("b", limit, windowMs).ok).toBe(true);
    expect(rateLimit("b", limit, windowMs).ok).toBe(true);
    expect(rateLimit("b", limit, windowMs).ok).toBe(false);
  });

  it("decrements `remaining` as requests are consumed", () => {
    const key = "user:42";
    const limit = 5;
    const windowMs = 60_000;

    // remaining is the count left in the window AFTER this request.
    expect(rateLimit(key, limit, windowMs).remaining).toBe(4);
    expect(rateLimit(key, limit, windowMs).remaining).toBe(3);
    expect(rateLimit(key, limit, windowMs).remaining).toBe(2);
    expect(rateLimit(key, limit, windowMs).remaining).toBe(1);
    expect(rateLimit(key, limit, windowMs).remaining).toBe(0);

    // Now blocked, remaining pinned at 0.
    expect(rateLimit(key, limit, windowMs).remaining).toBe(0);
  });

  it("reports retryAfterSec bounded by the window when blocked", () => {
    const key = "auth:9.9.9.9";
    const limit = 1;
    const windowMs = 30_000;

    expect(rateLimit(key, limit, windowMs).ok).toBe(true);

    const blocked = rateLimit(key, limit, windowMs);
    expect(blocked.ok).toBe(false);
    // Oldest hit just landed, so retry should be ~the full window (30s),
    // never more than the window and at least 1s.
    expect(blocked.retryAfterSec).toBeGreaterThanOrEqual(1);
    expect(blocked.retryAfterSec).toBeLessThanOrEqual(Math.ceil(windowMs / 1000));
  });
});
