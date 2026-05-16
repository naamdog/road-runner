import { PublisherError } from "./types";

export interface LongFormInput {
  accessToken: string;
  videoUrl: string;
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
  visibility: "public" | "unlisted" | "private";
  madeForKids: boolean;
  thumbnailUrl: string | null;
  /** Optional YouTube playlist id — video is appended after upload. */
  playlistId?: string | null;
}

export interface LongFormResult {
  videoId: string;
  videoUrl: string;
  /** Best-effort: whether the playlist add succeeded. */
  addedToPlaylist?: boolean;
}

/**
 * Publish a long-form video to YouTube via Data API v3.
 *
 * Differs from the Shorts publisher: takes full title / description / tags /
 * category / visibility, sets optional custom thumbnail, and can append to a
 * playlist after publish.
 */
export async function publishYouTubeLongform(
  input: LongFormInput
): Promise<LongFormResult> {
  // 1. Pull bytes from blob
  const sourceRes = await fetch(input.videoUrl);
  if (!sourceRes.ok) {
    throw new PublisherError(
      `Could not fetch video from storage (${sourceRes.status})`
    );
  }
  const contentType = sourceRes.headers.get("content-type") || "video/mp4";
  const contentLength = sourceRes.headers.get("content-length");
  const body = await sourceRes.arrayBuffer();

  // 2. Initiate resumable upload
  const metadata = {
    snippet: {
      title: input.title.slice(0, 100),
      description: input.description.slice(0, 5000),
      tags: input.tags.slice(0, 50),
      categoryId: input.categoryId,
    },
    status: {
      privacyStatus: input.visibility,
      selfDeclaredMadeForKids: input.madeForKids,
      embeddable: true,
    },
  };

  const initRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.accessToken}`,
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

  // 3. Upload bytes
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
  const videoId: string | undefined = result.id;
  if (!videoId) {
    throw new PublisherError("YouTube did not return a video id");
  }

  // 4. Optional thumbnail upload (best-effort — channel must be verified)
  if (input.thumbnailUrl) {
    try {
      const thumbRes = await fetch(input.thumbnailUrl);
      if (thumbRes.ok) {
        const thumbCt = thumbRes.headers.get("content-type") || "image/jpeg";
        const thumbBody = await thumbRes.arrayBuffer();
        await fetch(
          `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${input.accessToken}`,
              "Content-Type": thumbCt,
            },
            body: thumbBody,
          }
        );
      }
    } catch {
      // Don't fail the whole publish if thumbnail fails.
    }
  }

  // 5. Optional: add to playlist (best-effort — playlist might be missing)
  let addedToPlaylist = false;
  if (input.playlistId) {
    try {
      const plRes = await fetch(
        "https://www.googleapis.com/youtube/v3/playlistItems?part=snippet",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${input.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            snippet: {
              playlistId: input.playlistId,
              resourceId: {
                kind: "youtube#video",
                videoId,
              },
            },
          }),
        }
      );
      addedToPlaylist = plRes.ok;
    } catch {
      // ignore — video is published regardless
    }
  }

  return {
    videoId,
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    addedToPlaylist,
  };
}
