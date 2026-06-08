import { getConfig } from "../config";
import { fetchWithTimeout } from "./http";
import type { Publisher, RefreshResult, TokenRefresher } from "./types";
import { PublisherError } from "./types";

/**
 * TikTok Direct Post API.
 *
 * Flow:
 *   1. POST /v2/post/publish/inbox/video/init  with PULL_FROM_URL source
 *   2. (Or for direct posting, /v2/post/publish/video/init)
 *
 * For unaudited apps you typically get sandbox-only `video.upload` (UNLISTED).
 * Production-grade `video.publish` requires app audit.
 */
export const publishTikTok: Publisher = async ({
  videoUrl,
  caption,
  accessToken,
}) => {
  const initRes = await fetchWithTimeout(
    "https://open.tiktokapis.com/v2/post/publish/video/init/",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
      },
      body: JSON.stringify({
        post_info: {
          title: caption.slice(0, 2200),
          privacy_level: "PUBLIC_TO_EVERYONE",
          disable_duet: false,
          disable_comment: false,
          disable_stitch: false,
        },
        source_info: {
          source: "PULL_FROM_URL",
          video_url: videoUrl,
        },
      }),
    }
  );

  if (!initRes.ok) {
    const t = await initRes.text();
    throw new PublisherError(
      `TikTok init failed (${initRes.status}): ${t.slice(0, 200)}`,
      initRes.status >= 500
    );
  }
  const j = await initRes.json();
  const publishId: string | undefined = j?.data?.publish_id;
  if (!publishId) {
    throw new PublisherError("TikTok did not return a publish_id");
  }

  // Poll for completion (best-effort; TikTok docs recommend webhooks)
  const start = Date.now();
  while (Date.now() - start < 5 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 6000));
    let statusRes: Response;
    try {
      statusRes = await fetchWithTimeout(
        "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
          },
          body: JSON.stringify({ publish_id: publishId }),
        },
        15000
      );
    } catch (err) {
      // fetchWithTimeout throws a retryable PublisherError on timeout; tolerate a
      // single hung status request and keep polling within the budget (matching
      // the Instagram publisher) rather than tearing down the whole publish.
      if (err instanceof PublisherError && err.retryable) continue;
      throw err;
    }
    if (!statusRes.ok) continue;
    const s = await statusRes.json();
    const status = s?.data?.status;
    if (status === "PUBLISH_COMPLETE") {
      const shareUrl: string | undefined = s?.data?.publicaly_available_post_id
        ? `https://www.tiktok.com/@-/video/${s.data.publicaly_available_post_id}`
        : undefined;
      return { publishedId: publishId, publishedUrl: shareUrl ?? null };
    }
    if (status === "FAILED") {
      throw new PublisherError(
        `TikTok publish failed: ${s?.data?.fail_reason ?? "unknown"}`
      );
    }
  }

  // Timed out without a terminal status. Do NOT report success — the upload is
  // unconfirmed (still processing, stuck, or sandbox-UNLISTED). Mark it failed so
  // the operator is told to verify. retryable=false because there is no resume-by
  // -publish_id path: a retry would re-init from scratch and risk a duplicate post.
  throw new PublisherError(
    `TikTok upload ${publishId} still processing after 5 min — publish unconfirmed. Check TikTok and retry if it did not post.`,
    false
  );
};

/**
 * Refresh a TikTok access token using a refresh token.
 *
 * POST https://open.tiktokapis.com/v2/oauth/token/ with an
 * `application/x-www-form-urlencoded` body. TikTok rotates the refresh token on
 * each call, so the rotated value (when present) is returned; otherwise we keep
 * the caller's existing one.
 *
 * Requires TIKTOK_CLIENT_KEY / TIKTOK_CLIENT_SECRET (config.tiktok).
 */
export const refreshTikTok: TokenRefresher = async ({
  refreshToken,
}): Promise<RefreshResult> => {
  const tiktok = getConfig().tiktok;
  if (!tiktok) {
    throw new PublisherError("TikTok not configured", false);
  }

  const body = new URLSearchParams({
    client_key: tiktok.clientKey,
    client_secret: tiktok.clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const res = await fetchWithTimeout(
    "https://open.tiktokapis.com/v2/oauth/token/",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
    }
  );

  if (!res.ok) {
    const t = await res.text();
    throw new PublisherError(
      `TikTok token refresh failed (${res.status}): ${t.slice(0, 200)}`,
      res.status >= 500 || res.status === 429
    );
  }

  const j = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    refresh_expires_in?: number;
  };

  if (!j.access_token) {
    throw new PublisherError("TikTok token refresh returned no access_token", false);
  }

  const accessTokenExpiresAt =
    typeof j.expires_in === "number"
      ? new Date(Date.now() + j.expires_in * 1000)
      : null;

  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token ?? refreshToken,
    accessTokenExpiresAt,
  };
};
