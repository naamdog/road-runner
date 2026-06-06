import { describe, it, expect } from "vitest";
import {
  nextAttemptAt,
  SHORT_BASE_MS,
  SHORT_CAP_MS,
  TUBE_BASE_MS,
  TUBE_CAP_MS,
} from "../backoff";

/**
 * backoff.ts is a pure module (no env / no config singleton), so we can import it
 * directly. We pass now=0 for determinism and run many iterations per attempt to
 * exercise the random ±30% jitter band.
 */

const ITERATIONS = 200;
const FLOOR_MS = 1000; // Math.max(1000, ...) floor in nextAttemptAt
const JITTER = 0.3; // ±30%

/** Un-jittered ("raw") delay the implementation computes before jitter. */
function rawDelay(baseMs: number, capMs: number, attempts: number): number {
  return Math.min(capMs, Math.pow(2, attempts) * baseMs);
}

describe("nextAttemptAt", () => {
  // Cover both short-form and TubeRunner constant sets in the parametrised sweep.
  const configs = [
    { name: "SHORT", baseMs: SHORT_BASE_MS, capMs: SHORT_CAP_MS },
    { name: "TUBE", baseMs: TUBE_BASE_MS, capMs: TUBE_CAP_MS },
  ] as const;

  for (const { name, baseMs, capMs } of configs) {
    describe(`${name} constants (base=${baseMs}, cap=${capMs})`, () => {
      for (let attempts = 1; attempts <= 6; attempts++) {
        it(`attempt ${attempts}: respects floor and stays within the jitter band`, () => {
          const raw = rawDelay(baseMs, capMs, attempts);
          // The implementation rounds (raw + jitter); allow ±1ms for rounding.
          const lowBand = Math.round(raw * (1 - JITTER)) - 1;
          const highBand = Math.round(raw * (1 + JITTER)) + 1;

          for (let i = 0; i < ITERATIONS; i++) {
            const delay = nextAttemptAt(baseMs, capMs, attempts, 0).getTime();

            // Floor: never schedule sooner than 1s out (now=0 so getTime() === delay).
            expect(delay).toBeGreaterThanOrEqual(FLOOR_MS);

            // Within [raw*0.7, raw*1.3] (rounded, ±1ms tolerance).
            // The floor only ever raises the value, so the lower bound we assert
            // is max(FLOOR_MS, lowBand).
            expect(delay).toBeGreaterThanOrEqual(Math.max(FLOOR_MS, lowBand));
            expect(delay).toBeLessThanOrEqual(highBand);
          }
        });
      }
    });
  }

  it("never exceeds cap*1.3 for large attempt counts (capping holds)", () => {
    // For large attempts, 2^attempts*base >> cap, so raw === cap and the only
    // movement is jitter. Verify the cap holds across both constant sets.
    const configsLocal = [
      { baseMs: SHORT_BASE_MS, capMs: SHORT_CAP_MS },
      { baseMs: TUBE_BASE_MS, capMs: TUBE_CAP_MS },
    ];
    for (const { baseMs, capMs } of configsLocal) {
      const ceiling = Math.round(capMs * (1 + JITTER)) + 1;
      for (const attempts of [10, 20, 30, 50]) {
        // Sanity: at these attempt counts the raw delay is genuinely capped.
        expect(rawDelay(baseMs, capMs, attempts)).toBe(capMs);
        for (let i = 0; i < ITERATIONS; i++) {
          const delay = nextAttemptAt(baseMs, capMs, attempts, 0).getTime();
          expect(delay).toBeLessThanOrEqual(ceiling);
          expect(delay).toBeGreaterThanOrEqual(
            Math.max(FLOOR_MS, Math.round(capMs * (1 - JITTER)) - 1)
          );
        }
      }
    }
  });

  it("adds the now offset to the computed delay", () => {
    // With a non-zero now, the returned epoch must be now + delay, so subtracting
    // now lands back inside the jittered band for that attempt.
    const now = 1_000_000;
    const raw = rawDelay(SHORT_BASE_MS, SHORT_CAP_MS, 2);
    for (let i = 0; i < ITERATIONS; i++) {
      const delay = nextAttemptAt(SHORT_BASE_MS, SHORT_CAP_MS, 2, now).getTime() - now;
      expect(delay).toBeGreaterThanOrEqual(Math.round(raw * (1 - JITTER)) - 1);
      expect(delay).toBeLessThanOrEqual(Math.round(raw * (1 + JITTER)) + 1);
    }
  });
});
