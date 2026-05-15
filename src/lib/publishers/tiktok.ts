import type { Publisher } from "./types";
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
  const initRes = await fetch(
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
    const statusRes = await fetch(
      "https://open.tiktokapis.com/v2/post/publish/status/fetch/",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({ publish_id: publishId }),
      }
    );
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

  // Timed out polling — still return success so user can verify
  return { publishedId: publishId, publishedUrl: null };
};
