import type { Publisher, TokenRefresher } from "./types";
import { PublisherError } from "./types";
import { fetchWithTimeout } from "./http";
import { getConfig } from "../config";

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
  const initRes = await fetchWithTimeout(
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
  const videoRes = await fetchWithTimeout(videoUrl);
  if (!videoRes.ok) {
    throw new PublisherError("Could not fetch source video");
  }
  const buf = await videoRes.arrayBuffer();
  const upRes = await fetchWithTimeout(uploadUrl, {
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
  const postRes = await fetchWithTimeout("https://api.linkedin.com/v2/ugcPosts", {
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

/**
 * Refresh a LinkedIn access token via the OAuth refresh-token grant.
 *
 * NOTE: LinkedIn only issues refresh tokens to apps that have been granted the
 * special "programmatic refresh tokens" capability; most apps never receive a
 * refresh token and must re-run the OAuth consent flow. When the grant is not
 * available LinkedIn responds with HTTP 400, which we surface as a terminal
 * (non-retryable) error so the connection is flagged for reconnect rather than
 * retried fruitlessly. Transient 429/5xx responses stay retryable.
 *
 * Required env: LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET
 */
export const refreshLinkedIn: TokenRefresher = async (input) => {
  const config = getConfig().linkedin;
  if (!config) {
    throw new PublisherError("LinkedIn not configured", false);
  }

  const res = await fetchWithTimeout(
    "https://www.linkedin.com/oauth/v2/accessToken",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: input.refreshToken,
        client_id: config.clientId,
        client_secret: config.clientSecret,
      }).toString(),
    }
  );

  if (!res.ok) {
    const t = await res.text();
    // 400 => the app lacks refresh-token approval (or the token is invalid):
    // terminal, the connection must be re-authorized. 429/5xx are transient.
    const retryable = res.status === 429 || res.status >= 500;
    throw new PublisherError(
      `LinkedIn token refresh failed (${res.status}): ${t.slice(0, 200)}`,
      retryable
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token?: string | null;
    refresh_token_expires_in?: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? input.refreshToken,
    accessTokenExpiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
};
