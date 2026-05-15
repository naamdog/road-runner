import type { Publisher } from "./types";
import { PublisherError } from "./types";

/**
 * Facebook Page Reels publisher.
 *
 * Flow (Reels):
 *   1. POST /{page-id}/video_reels?upload_phase=start  → get video_id + upload_url
 *   2. Upload bytes via HEADERS file_url (PULL) or chunk PUT (TRANSFER)
 *   3. POST /{page-id}/video_reels?upload_phase=finish with video_state=PUBLISHED
 *
 * Required: page access token (long-lived) and `pages_manage_posts` scope.
 */
export const publishFacebook: Publisher = async ({
  videoUrl,
  caption,
  accessToken,
  metadata,
}) => {
  const pageId = (metadata?.pageId as string) || (metadata?.accountId as string);
  if (!pageId) {
    throw new PublisherError("Facebook connection missing pageId — reconnect.", false);
  }

  // 1. Start
  const startRes = await fetch(
    `https://graph.facebook.com/v19.0/${pageId}/video_reels?upload_phase=start&access_token=${accessToken}`,
    { method: "POST" }
  );
  if (!startRes.ok) {
    const t = await startRes.text();
    throw new PublisherError(`Facebook start failed: ${t.slice(0, 200)}`);
  }
  const { video_id: videoId, upload_url } = (await startRes.json()) as {
    video_id: string;
    upload_url: string;
  };
  if (!videoId || !upload_url) {
    throw new PublisherError("Facebook did not return video_id / upload_url");
  }

  // 2. Transfer via file_url (PULL)
  const transferRes = await fetch(upload_url, {
    method: "POST",
    headers: {
      Authorization: `OAuth ${accessToken}`,
      file_url: videoUrl,
    },
  });
  if (!transferRes.ok) {
    const t = await transferRes.text();
    throw new PublisherError(`Facebook transfer failed: ${t.slice(0, 200)}`);
  }

  // 3. Finish + publish
  const finishUrl = new URL(`https://graph.facebook.com/v19.0/${pageId}/video_reels`);
  finishUrl.searchParams.set("access_token", accessToken);
  finishUrl.searchParams.set("video_id", videoId);
  finishUrl.searchParams.set("upload_phase", "finish");
  finishUrl.searchParams.set("video_state", "PUBLISHED");
  finishUrl.searchParams.set("description", caption);

  const finishRes = await fetch(finishUrl, { method: "POST" });
  if (!finishRes.ok) {
    const t = await finishRes.text();
    throw new PublisherError(`Facebook publish failed: ${t.slice(0, 200)}`);
  }
  return {
    publishedId: videoId,
    publishedUrl: `https://www.facebook.com/reel/${videoId}`,
  };
};
