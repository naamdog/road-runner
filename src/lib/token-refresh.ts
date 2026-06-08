import { eq } from "drizzle-orm";
import { decryptSecret, encryptSecret, isEncrypted } from "./crypto";
import { db } from "./db";
import { connection } from "./db/schema";
import { createLogger } from "./logger";
import type { Platform } from "./platforms";
import { refreshers } from "./publishers";
import { PublisherError } from "./publishers/types";

const log = createLogger({ scope: "token-refresh" });

/** Refresh access tokens once they are within this window of expiry. */
const EXPIRY_SKEW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Decrypts tokens, refreshes if near/past expiry, persists the re-encrypted
 * token, and flips `needsReconnect`. Returns a usable (decrypted) access token.
 *
 * Throws a non-retryable `PublisherError` when the connection has no usable
 * token and cannot be refreshed — the caller should surface a "reconnect"
 * prompt to the user rather than retrying.
 */
export async function ensureFreshAccessToken(conn: {
  id: string;
  platform: Platform;
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: Date | null;
  metadata: Record<string, unknown> | null;
}): Promise<string> {
  // A decrypt failure here almost always means TOKEN_ENC_KEY changed (rotated or
  // mistyped): every stored ciphertext was sealed with the old key, so AES-GCM
  // auth fails. Without this guard the raw crypto error escapes as a generic,
  // retryable "post failed" (3 wasted attempts) and the connection is never
  // flagged — so the operator sees cryptic failures while the UI shows the
  // account as healthy. Flag it as needs-reconnect instead.
  let access: string | null;
  let refresh: string | null;
  try {
    access = decryptSecret(conn.accessToken);
    refresh = decryptSecret(conn.refreshToken);
  } catch {
    await markNeedsReconnect(
      conn.id,
      "Stored token could not be decrypted — the encryption key (TOKEN_ENC_KEY) may have changed. Please reconnect this account."
    );
    throw new PublisherError(
      `Connection needs reconnect: ${conn.platform}`,
      false
    );
  }

  // A stored token that is NOT in enc:v1: format is either un-migrated legacy
  // plaintext or a ciphertext corrupted at rest (its prefix was lost, so it
  // silently bypassed AES-GCM auth). In steady state every token is encrypted,
  // so this should never fire — log it if it does so the corruption is visible.
  if (
    process.env.NODE_ENV === "production" &&
    conn.accessToken &&
    !isEncrypted(conn.accessToken)
  ) {
    log.warn(
      { connectionId: conn.id, platform: conn.platform },
      "stored access token is not in enc:v1: format (legacy plaintext or corrupted at rest)"
    );
  }

  // Still fresh (or unknown expiry): use the current token as-is.
  if (
    conn.accessTokenExpiresAt === null ||
    conn.accessTokenExpiresAt.getTime() - Date.now() > EXPIRY_SKEW_MS
  ) {
    if (!access) {
      throw new PublisherError("Connection missing access token", false);
    }
    return access;
  }

  // Expired (or within the skew window): refresh if we can.
  const refresher = refreshers[conn.platform];
  if (refresher && refresh) {
    try {
      const r = await refresher({
        refreshToken: refresh,
        accessToken: access,
        metadata: conn.metadata,
      });
      const now = new Date();
      await db
        .update(connection)
        .set({
          accessToken: encryptSecret(r.accessToken),
          // undefined leaves the column unchanged (drizzle skips undefined).
          refreshToken: r.refreshToken
            ? encryptSecret(r.refreshToken)
            : undefined,
          accessTokenExpiresAt: r.accessTokenExpiresAt ?? null,
          lastRefreshedAt: now,
          needsReconnect: false,
          lastRefreshError: null,
          updatedAt: now,
        })
        .where(eq(connection.id, conn.id));
      return r.accessToken;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Transient failure (network timeout, 429, 5xx): the refresher signals
      // this with a retryable PublisherError. Do NOT flag the connection or fail
      // the post permanently — a healthy token-endpoint blip must be retried.
      if (err instanceof PublisherError && err.retryable) {
        log.warn(
          { connectionId: conn.id, platform: conn.platform, err: message },
          "token refresh failed (transient — will retry)"
        );
        throw err; // stays retryable; dispatcher reschedules within MAX_ATTEMPTS
      }
      // Permanent failure (invalid_grant / revoked / not configured): the user
      // must reconnect this account.
      log.warn(
        { connectionId: conn.id, platform: conn.platform, err: message },
        "token refresh failed (permanent — needs reconnect)"
      );
      await markNeedsReconnect(conn.id, message);
      throw new PublisherError(
        `Connection needs reconnect: ${conn.platform}`,
        false
      );
    }
  }

  // Expired with no refresher or no refresh token: must reconnect.
  const message = refresher
    ? "Missing refresh token"
    : `No token refresher for platform: ${conn.platform}`;
  await markNeedsReconnect(conn.id, message);
  throw new PublisherError(`Connection needs reconnect: ${conn.platform}`, false);
}

/** Flag a connection as needing the user to reconnect, recording the reason. */
async function markNeedsReconnect(id: string, error: string): Promise<void> {
  await db
    .update(connection)
    .set({
      needsReconnect: true,
      lastRefreshError: error.slice(0, 1000),
      updatedAt: new Date(),
    })
    .where(eq(connection.id, id));
}
