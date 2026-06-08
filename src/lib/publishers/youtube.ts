import type { Publisher, TokenRefresher } from "./types";
import { PublisherError } from "./types";
import { fetchWithTimeout } from "./http";
import { getConfig } from "../config";

/**
 * YouTube Shorts publisher.
 *
 * Uses the Data API v3 `videos.insert` endpoint with a resumable upload.
 * The video must be 9:16 vertical and ≤ 60 seconds for it to surface in Shorts.
 *
 * Required env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
 * Required scope: https://www.googleapis.com/auth/youtube.upload
 */
export const publishYouTube: Publisher = async ({
  videoUrl,
  caption,
  title,
  accessToken,
}) => {
  // 1. Fetch the source video from blob storage
  const videoRes = await fetchWithTimeout(videoUrl);
  if (!videoRes.ok) {
    throw new PublisherError(`Could not fetch video from storage (${videoRes.status})`);
  }
  const contentType = videoRes.headers.get("content-type") || "video/mp4";
  const contentLength = videoRes.headers.get("content-length");
  const body = await videoRes.arrayBuffer();

  // 2. Initiate resumable upload session
  const metadata = {
    snippet: {
      title: (title || caption.split("\n")[0] || "Untitled short").slice(0, 100),
      description: caption,
      categoryId: "22",
    },
    status: {
      privacyStatus: "public",
      selfDeclaredMadeForKids: false,
    },
  };

  const initRes = await fetchWithTimeout(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": contentType,
        ...(contentLength ? { "X-Upload-Content-Length": contentLength } : {}),
      },
      body: JSON.stringify(metadata),
    }
  );

  if (!initRes.ok) {
    const t = await initRes.text();
    throw new PublisherError(
      `YouTube upload init failed (${initRes.status}): ${t.slice(0, 200)}`,
      initRes.status >= 500 || initRes.status === 429
    );
  }
  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) {
    throw new PublisherError("YouTube did not return an upload URL");
  }

  // 3. Upload bytes in one chunk. The byte transfer can take a while for larger
  //    videos, so use a generous timeout instead of the default.
  const uploadRes = await fetchWithTimeout(
    uploadUrl,
    {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body,
    },
    120000
  );
  if (!uploadRes.ok) {
    const t = await uploadRes.text();
    throw new PublisherError(
      `YouTube upload failed (${uploadRes.status}): ${t.slice(0, 200)}`,
      uploadRes.status >= 500 || uploadRes.status === 429
    );
  }

  const result = await uploadRes.json();
  const videoId: string | undefined = result.id;
  if (!videoId) {
    // A 200 with no id means the upload did not actually create a video.
    // Throw instead of recording a phantom "published" row with no URL.
    throw new PublisherError("YouTube did not return a video id");
  }
  return {
    publishedId: videoId,
    publishedUrl: `https://youtube.com/shorts/${videoId}`,
  };
};

/**
 * Refresh a YouTube (Google OAuth) access token.
 *
 * POSTs to Google's token endpoint with `grant_type=refresh_token`. Google does
 * not rotate the refresh token, so the existing one is returned unchanged.
 *
 * A 400 from Google means the grant is invalid (refresh token revoked or
 * expired) — the user must reconnect, so this is thrown as terminal
 * (non-retryable). 5xx/429 are transient and thrown as retryable.
 */
export const refreshYouTube: TokenRefresher = async (input) => {
  const { google } = getConfig();

  const params = new URLSearchParams({
    client_id: google.clientId,
    client_secret: google.clientSecret,
    grant_type: "refresh_token",
    refresh_token: input.refreshToken,
  });

  const res = await fetchWithTimeout("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const t = await res.text();
    const msg = `YouTube refresh failed (${res.status}): ${t.slice(0, 200)}`;
    if (res.status === 400) {
      // invalid_grant — refresh token revoked/expired; reconnect required.
      throw new PublisherError("YouTube refresh rejected (reconnect needed)", false);
    }
    if (res.status >= 500 || res.status === 429) {
      throw new PublisherError(msg, true);
    }
    throw new PublisherError(msg, false);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    accessTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
    // Google does not rotate the refresh token; keep the existing one.
    refreshToken: input.refreshToken,
  };
};
