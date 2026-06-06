/**
 * Retry backoff: capped exponential with ±30% jitter.
 *
 * Jitter prevents a thundering herd when many targets fail at the same instant
 * (e.g. a platform outage) and would otherwise all retry on the same schedule.
 * Short-form and TubeRunner keep distinct caps for parity with prior behavior.
 */

export const SHORT_BASE_MS = 60 * 1000;
export const SHORT_CAP_MS = 15 * 60 * 1000;
export const TUBE_BASE_MS = 2 * 60 * 1000;
export const TUBE_CAP_MS = 30 * 60 * 1000;

/**
 * Compute the next attempt time.
 *
 * @param baseMs    Base delay (doubled each attempt).
 * @param capMs     Maximum un-jittered delay.
 * @param attempts  The attempt number just completed (1-based).
 * @param now       Epoch ms; injectable for tests. Defaults to Date.now().
 */
export function nextAttemptAt(
  baseMs: number,
  capMs: number,
  attempts: number,
  now: number = Date.now()
): Date {
  const raw = Math.min(capMs, Math.pow(2, attempts) * baseMs);
  const jitter = raw * 0.3 * (Math.random() * 2 - 1); // ±30%
  return new Date(now + Math.max(1000, Math.round(raw + jitter)));
}
