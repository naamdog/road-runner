import type { Publisher } from "./types";
import { PublisherError } from "./types";
import { fetchWithTimeout } from "./http";
import { META_GRAPH_BASE } from "@/lib/meta-graph";

/**
 * Facebook Page Reels publisher.
 *
 * Flow (Reels):
 *   1. POST /{page-id}/video_reels?upload_phase=start  → get video_id + upload_url
 *   2. Upload bytes via HEADERS file_url (PULL) or chunk PUT (TRANSFER)
 *   3. POST /{page-id}/video_reels?upload_phase=finish with video_state=PUBLISHED
 *
 * Required: page access token (long-lived) and `pages_manage_posts` scope.
 *
 * No token refresher: Meta Page access tokens derived from a long-lived user
 * token do not expire, so there is nothing to refresh (see HARDENING_PLAN.md).
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
  const startRes = await fetchWithTimeout(
    `${META_GRAPH_BASE}/${pageId}/video_reels?upload_phase=start&access_token=${accessToken}`,
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
  const transferRes = await fetchWithTimeout(upload_url, {
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
  const finishUrl = new URL(`${META_GRAPH_BASE}/${pageId}/video_reels`);
  finishUrl.searchParams.set("access_token", accessToken);
  finishUrl.searchParams.set("video_id", videoId);
  finishUrl.searchParams.set("upload_phase", "finish");
  finishUrl.searchParams.set("video_state", "PUBLISHED");
  finishUrl.searchParams.set("description", caption);

  const finishRes = await fetchWithTimeout(finishUrl.toString(), { method: "POST" });
  if (!finishRes.ok) {
    const t = await finishRes.text();
    throw new PublisherError(`Facebook publish failed: ${t.slice(0, 200)}`);
  }

  // A 2xx on `finish` only ACKNOWLEDGES the publish request — Reels processing is
  // async, so the reel can still fail transcoding/policy checks afterwards. Poll
  // the video status briefly to catch an outright processing failure instead of
  // recording a "published" row whose permalink 404s.
  //
  // Deliberately conservative so we never break the working path: we only THROW
  // on an unambiguous terminal `error`. On a confirmed-ready status we return
  // early; on timeout or any status shape we don't recognise we fall through to
  // the optimistic success return (identical to the original behaviour). Worst
  // case for an unexpected field shape is a little added latency, never a false
  // failure.
  const start = Date.now();
  while (Date.now() - start < 90 * 1000) {
    await new Promise((r) => setTimeout(r, 5000));
    let statusRes: Response;
    try {
      statusRes = await fetchWithTimeout(
        `${META_GRAPH_BASE}/${videoId}?fields=status&access_token=${accessToken}`,
        undefined,
        15000
      );
    } catch (err) {
      if (err instanceof PublisherError && err.retryable) continue; // transient poll blip
      throw err;
    }
    if (!statusRes.ok) continue;
    const { status } = (await statusRes.json()) as {
      status?: {
        video_status?: string;
        processing_phase?: { status?: string };
        publishing_phase?: { status?: string };
      };
    };
    const videoStatus = status?.video_status;
    if (videoStatus === "ready" || status?.publishing_phase?.status === "complete") {
      break; // confirmed live
    }
    if (videoStatus === "error" || status?.processing_phase?.status === "error") {
      throw new PublisherError("Facebook reel failed processing after upload");
    }
  }

  return {
    publishedId: videoId,
    publishedUrl: `https://www.facebook.com/reel/${videoId}`,
  };
};
