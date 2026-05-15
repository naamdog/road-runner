import type { Fetcher, PopularVideo } from "./types";
import { FetcherError } from "./types";

/**
 * Fetch the user's top TikTok videos.
 *
 * Requires the `video.list` scope (granted with `user.info.basic` is *not*
 * enough — many apps don't have this approved yet, so we degrade gracefully).
 *
 * Note: TikTok serves rotating signed video URLs that are not stable enough
 * to download server-side. We surface metadata + embed_link; the user must
 * download from TikTok directly to re-upload.
 */
export const fetchTikTokPopular: Fetcher = async ({
  accessToken,
  connectionId,
  accountName,
  accountHandle,
  limit,
}) => {
  const fields = [
    "id",
    "title",
    "video_description",
    "duration",
    "cover_image_url",
    "embed_link",
    "share_url",
    "view_count",
    "like_count",
    "comment_count",
    "share_count",
    "create_time",
  ].join(",");

  const res = await fetch(
    `https://open.tiktokapis.com/v2/video/list/?fields=${encodeURIComponent(fields)}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ max_count: Math.min(limit, 20) }),
    }
  );
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      // Likely missing video.list scope. Don't error the whole feed.
      return [];
    }
    throw new FetcherError(`TikTok fetch failed (${res.status})`, "tiktok");
  }
  const json = await res.json();
  const items: TikTokVideo[] = json.data?.videos || [];

  const sorted = items
    .sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0))
    .slice(0, limit);

  return sorted.map((v): PopularVideo => ({
    id: `tiktok:${v.id}`,
    platform: "tiktok",
    externalId: v.id,
    caption: v.video_description || v.title || "",
    title: v.title || null,
    permalinkUrl: v.share_url || v.embed_link || "",
    thumbnailUrl: v.cover_image_url || null,
    videoUrl: null, // rotating signed URLs not safe to download
    canAutoDownload: false,
    durationSec: v.duration ?? null,
    publishedAt: v.create_time ? new Date(v.create_time * 1000).toISOString() : null,
    views: v.view_count ?? null,
    likes: v.like_count ?? null,
    comments: v.comment_count ?? null,
    shares: v.share_count ?? null,
    accountName,
    accountHandle,
    connectionId,
  }));
};

interface TikTokVideo {
  id: string;
  title?: string;
  video_description?: string;
  duration?: number;
  cover_image_url?: string;
  embed_link?: string;
  share_url?: string;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
  create_time?: number;
}
