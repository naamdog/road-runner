import type { Publisher } from "./types";
import { PublisherError } from "./types";

/**
 * LinkedIn video UGC post.
 *
 * Flow:
 *   1. Initialize upload: POST /v2/assets?action=registerUpload
 *   2. PUT video bytes to returned upload URL
 *   3. Create UGC post: POST /v2/ugcPosts with media reference
 */
export const publishLinkedIn: Publisher = async ({
  videoUrl,
  caption,
  accessToken,
  metadata,
}) => {
  const urn = (metadata?.urn as string) || "";
  if (!urn) {
    throw new PublisherError("LinkedIn connection missing URN — reconnect.", false);
  }

  // 1. Register upload
  const initRes = await fetch(
    "https://api.linkedin.com/v2/assets?action=registerUpload",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
      },
      body: JSON.stringify({
        registerUploadRequest: {
          recipes: ["urn:li:digitalmediaRecipe:feedshare-video"],
          owner: urn,
          serviceRelationships: [
            {
              relationshipType: "OWNER",
              identifier: "urn:li:userGeneratedContent",
            },
          ],
        },
      }),
    }
  );
  if (!initRes.ok) {
    const t = await initRes.text();
    throw new PublisherError(
      `LinkedIn register failed: ${t.slice(0, 200)}`,
      initRes.status >= 500
    );
  }
  const init = await initRes.json();
  const asset = init.value?.asset as string;
  const uploadUrl =
    init.value?.uploadMechanism?.[
      "com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest"
    ]?.uploadUrl;

  if (!asset || !uploadUrl) {
    throw new PublisherError("LinkedIn did not return upload URL");
  }

  // 2. Stream the video from blob to LinkedIn
  const videoRes = await fetch(videoUrl);
  if (!videoRes.ok) {
    throw new PublisherError("Could not fetch source video");
  }
  const buf = await videoRes.arrayBuffer();
  const upRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": videoRes.headers.get("content-type") || "video/mp4",
    },
    body: buf,
  });
  if (!upRes.ok) {
    throw new PublisherError(`LinkedIn upload failed (${upRes.status})`);
  }

  // 3. Create UGC post
  const postRes = await fetch("https://api.linkedin.com/v2/ugcPosts", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "X-Restli-Protocol-Version": "2.0.0",
    },
    body: JSON.stringify({
      author: urn,
      lifecycleState: "PUBLISHED",
      specificContent: {
        "com.linkedin.ugc.ShareContent": {
          shareCommentary: { text: caption },
          shareMediaCategory: "VIDEO",
          media: [
            {
              status: "READY",
              media: asset,
              title: { text: caption.slice(0, 200) },
            },
          ],
        },
      },
      visibility: {
        "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC",
      },
    }),
  });
  if (!postRes.ok) {
    const t = await postRes.text();
    throw new PublisherError(`LinkedIn post failed: ${t.slice(0, 200)}`);
  }
  const postId = postRes.headers.get("x-restli-id") || asset;
  return {
    publishedId: postId,
    publishedUrl: postId.startsWith("urn:li:")
      ? `https://www.linkedin.com/feed/update/${encodeURIComponent(postId)}/`
      : null,
  };
};
