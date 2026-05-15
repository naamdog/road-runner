import type { Publisher } from "./types";
import { PublisherError } from "./types";

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
  const containerRes = await fetch(
    `https://graph.facebook.com/v19.0/${igUserId}/media`,
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

  // 2. Poll status
  const start = Date.now();
  while (Date.now() - start < 5 * 60 * 1000) {
    await new Promise((r) => setTimeout(r, 5000));
    const statusRes = await fetch(
      `https://graph.facebook.com/v19.0/${creationId}?fields=status_code&access_token=${accessToken}`
    );
    if (!statusRes.ok) continue;
    const { status_code } = (await statusRes.json()) as { status_code: string };
    if (status_code === "FINISHED") break;
    if (status_code === "ERROR" || status_code === "EXPIRED") {
      throw new PublisherError(`Instagram container ${status_code}`);
    }
  }

  // 3. Publish
  const publishRes = await fetch(
    `https://graph.facebook.com/v19.0/${igUserId}/media_publish`,
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
