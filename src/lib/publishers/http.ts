import { PublisherError } from "./types";

/**
 * `fetch` with an AbortController-based timeout.
 *
 * On timeout/abort throws a retryable `PublisherError` naming the target host.
 * Publishers must route ALL outbound `fetch()` through this so slow/hung
 * provider calls cannot block the dispatcher indefinitely.
 *
 * Default timeout: 30000ms.
 */
export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  timeoutMs = 30000
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      let host = url;
      try {
        host = new URL(url).host;
      } catch {
        // Best-effort: fall back to the raw URL if it can't be parsed.
      }
      throw new PublisherError(`Request to ${host} timed out`, true);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}
