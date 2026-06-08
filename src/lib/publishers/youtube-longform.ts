import { PublisherError } from "./types";
import { fetchWithTimeout } from "./http";
import { createLogger } from "../logger";

const log = createLogger({ scope: "youtube-longform" });

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
  /**
   * Best-effort: whether the custom thumbnail was set. `undefined` means no
   * thumbnail was requested, `false` means it was requested but failed.
   */
  thumbnailSet?: boolean;
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
  const sourceRes = await fetchWithTimeout(input.videoUrl);
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

  const initRes = await fetchWithTimeout(
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

  // 3. Upload bytes (large transfer — allow a generous timeout)
  const uploadRes = await fetchWithTimeout(
    uploadUrl,
    {
      method: "PUT",
      headers: { "Content-Type": contentType },
      body,
    },
    180000
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
    throw new PublisherError("YouTube did not return a video id");
  }

  // 4. Optional thumbnail upload (best-effort — channel must be verified).
  // Track the outcome so the dispatcher can tell the operator if the chosen
  // thumbnail silently didn't stick (otherwise the post looks fully published).
  let thumbnailSet: boolean | undefined = undefined;
  if (input.thumbnailUrl) {
    try {
      const thumbRes = await fetchWithTimeout(input.thumbnailUrl);
      if (thumbRes.ok) {
        const thumbCt = thumbRes.headers.get("content-type") || "image/jpeg";
        const thumbBody = await thumbRes.arrayBuffer();
        const setRes = await fetchWithTimeout(
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
        thumbnailSet = setRes.ok;
        if (!setRes.ok) {
          log.warn(
            { videoId, status: setRes.status },
            "thumbnail set failed (best-effort, video still published)"
          );
        }
      } else {
        thumbnailSet = false;
        log.warn(
          { videoId, status: thumbRes.status },
          "could not fetch thumbnail source (best-effort)"
        );
      }
    } catch (err) {
      // Don't fail the whole publish if thumbnail fails — but surface it.
      thumbnailSet = false;
      log.warn(
        { videoId, err: err instanceof Error ? err.message : String(err) },
        "thumbnail upload threw (best-effort, ignored)"
      );
    }
  }

  // 5. Optional: add to playlist (best-effort — playlist might be missing)
  let addedToPlaylist = false;
  if (input.playlistId) {
    try {
      const plRes = await fetchWithTimeout(
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
      if (!plRes.ok) {
        log.warn(
          { videoId, playlistId: input.playlistId, status: plRes.status },
          "playlist add failed (best-effort, video still published)"
        );
      }
    } catch (err) {
      // ignore — video is published regardless, but surface it.
      log.warn(
        {
          videoId,
          playlistId: input.playlistId,
          err: err instanceof Error ? err.message : String(err),
        },
        "playlist add threw (best-effort, ignored)"
      );
    }
  }

  return {
    videoId,
    videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
    addedToPlaylist,
    thumbnailSet,
  };
}
