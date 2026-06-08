import type { Publisher } from "./types";
import { PublisherError } from "./types";
import { fetchWithTimeout } from "./http";
import { META_GRAPH_BASE } from "@/lib/meta-graph";

/**
 * Instagram Reels publisher (via Instagram Graph API).
 *
 * Requires a connected Instagram Business / Creator account linked to a
 * Facebook Page. We expect `metadata.igUserId` and a long-lived page access
 * token to be set on the connection.
 *
 * Flow:
 *   1. POST /{ig-user-id}/media  with media_type=REELS and video_url
 *   2. Poll /{container-id}?fields=status_code  until FINISHED
 *   3. POST /{ig-user-id}/media_publish?creation_id=...
 *
 * No token refresher: Meta Page access tokens derived from a long-lived user
 * token do not expire, so there is no `refreshInstagram` export. The dispatcher
 * passes an already-decrypted access token; do not decrypt here.
 */
export const publishInstagram: Publisher = async ({
  videoUrl,
  caption,
  accessToken,
  metadata,
}) => {
  const igUserId = (metadata?.igUserId as string) || (metadata?.businessAccountId as string);
  if (!igUserId) {
    throw new PublisherError(
      "Instagram connection missing igUserId — re-connect via Connections.",
      false
    );
  }

  // 1. Create container
  const containerRes = await fetchWithTimeout(
    `${META_GRAPH_BASE}/${igUserId}/media`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        media_type: "REELS",
        video_url: videoUrl,
        caption,
        access_token: accessToken,
      }),
    }
  );
  if (!containerRes.ok) {
    const t = await containerRes.text();
    throw new PublisherError(
      `Instagram container failed: ${t.slice(0, 200)}`,
      containerRes.status >= 500 || containerRes.status === 429
    );
  }
  const { id: creationId } = (await containerRes.json()) as { id: string };

  // 2. Poll status (each poll request has its own timeout so a single hung
  //    request can't consume the whole 5-minute polling budget). A single
  //    poll-request timeout is tolerated and we keep polling until FINISHED or
  //    the overall budget expires — matching the original swallow-and-continue
  //    behaviour on a transient request failure.
  const start = Date.now();
  while (Date.now() - start < 5 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 5000));
    let statusRes: Response;
    try {
      statusRes = await fetchWithTimeout(
        `${META_GRAPH_BASE}/${creationId}?fields=status_code&access_token=${accessToken}`,
        undefined,
        15000
      );
    } catch (err) {
      // fetchWithTimeout throws a retryable PublisherError on timeout; treat a
      // single poll timeout as transient and continue within the budget.
      if (err instanceof PublisherError && err.retryable) continue;
      throw err;
    }
    if (!statusRes.ok) continue;
    const { status_code } = (await statusRes.json()) as { status_code: string };
    if (status_code === "FINISHED") break;
    if (status_code === "ERROR" || status_code === "EXPIRED") {
      throw new PublisherError(`Instagram container ${status_code}`);
    }
  }

  // 3. Publish
  const publishRes = await fetchWithTimeout(
    `${META_GRAPH_BASE}/${igUserId}/media_publish`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        creation_id: creationId,
        access_token: accessToken,
      }),
    }
  );
  if (!publishRes.ok) {
    const t = await publishRes.text();
    throw new PublisherError(`Instagram publish failed: ${t.slice(0, 200)}`);
  }
  const { id: mediaId } = (await publishRes.json()) as { id: string };

  return {
    publishedId: mediaId,
    publishedUrl: `https://www.instagram.com/reel/${mediaId}/`,
  };
};
