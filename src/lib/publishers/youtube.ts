import type { Publisher } from "./types";
import { PublisherError } from "./types";

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
  const videoRes = await fetch(videoUrl);
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

  const initRes = await fetch(
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

  // 3. Upload bytes in one chunk
  const uploadRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body,
  });
  if (!uploadRes.ok) {
    const t = await uploadRes.text();
    throw new PublisherError(
      `YouTube upload failed (${uploadRes.status}): ${t.slice(0, 200)}`,
      uploadRes.status >= 500 || uploadRes.status === 429
    );
  }

  const result = await uploadRes.json();
  const videoId = result.id;
  return {
    publishedId: videoId,
    publishedUrl: videoId ? `https://youtube.com/shorts/${videoId}` : null,
  };
};
