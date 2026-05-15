import type { Fetcher, PopularVideo } from "./types";
import { FetcherError } from "./types";

/**
 * Fetch the user's top YouTube Shorts by view count.
 *
 * Uses search.list + videos.list because search returns IDs but no stats,
 * and videos.list needs IDs but gives statistics.
 *
 * Note: search.list with order=viewCount sorts API results by views; combined
 * with videoDuration=short this gives us Shorts ranked.
 */
export const fetchYouTubePopular: Fetcher = async ({
  accessToken,
  connectionId,
  accountId,
  accountName,
  accountHandle,
  limit,
}) => {
  // 1. Find video IDs for the user's most-viewed Shorts
  const searchRes = await fetch(
    "https://www.googleapis.com/youtube/v3/search?" +
      new URLSearchParams({
        part: "snippet",
        forMine: "true",
        type: "video",
        videoDuration: "short",
        order: "viewCount",
        maxResults: String(Math.min(limit, 50)),
      }),
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!searchRes.ok) {
    throw new FetcherError(
      `YouTube search failed (${searchRes.status})`,
      "youtube"
    );
  }
  const searchJson = await searchRes.json();
  const ids: string[] = (searchJson.items || [])
    .map((it: { id?: { videoId?: string } }) => it.id?.videoId)
    .filter(Boolean);
  if (ids.length === 0) return [];

  // 2. Get stats + content details for those IDs
  const videosRes = await fetch(
    "https://www.googleapis.com/youtube/v3/videos?" +
      new URLSearchParams({
        part: "snippet,statistics,contentDetails",
        id: ids.join(","),
        maxResults: String(ids.length),
      }),
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!videosRes.ok) {
    throw new FetcherError(
      `YouTube videos.list failed (${videosRes.status})`,
      "youtube"
    );
  }
  const videosJson = await videosRes.json();

  return (videosJson.items || []).map((v: YTVideo): PopularVideo => {
    const stats = v.statistics ?? {};
    const snip = v.snippet ?? {};
    const thumbs = snip.thumbnails;
    const bestThumb =
      thumbs?.maxres?.url ||
      thumbs?.standard?.url ||
      thumbs?.high?.url ||
      thumbs?.medium?.url ||
      thumbs?.default?.url ||
      null;
    return {
      id: `youtube:${v.id}`,
      platform: "youtube",
      externalId: v.id,
      caption: snip.description || snip.title || "",
      title: snip.title || null,
      permalinkUrl: `https://youtube.com/shorts/${v.id}`,
      thumbnailUrl: bestThumb,
      videoUrl: null, // YT doesn't expose raw video via API
      canAutoDownload: false,
      durationSec: parseIsoDuration(v.contentDetails?.duration ?? ""),
      publishedAt: snip.publishedAt || null,
      views: stats.viewCount ? Number(stats.viewCount) : null,
      likes: stats.likeCount ? Number(stats.likeCount) : null,
      comments: stats.commentCount ? Number(stats.commentCount) : null,
      shares: null,
      accountName,
      accountHandle,
      connectionId,
    };
  });
};

interface YTVideo {
  id: string;
  snippet?: {
    title?: string;
    description?: string;
    publishedAt?: string;
    thumbnails?: Record<
      "default" | "medium" | "high" | "standard" | "maxres",
      { url?: string } | undefined
    >;
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
  contentDetails?: { duration?: string };
}

function parseIsoDuration(iso: string): number | null {
  // PT#M#S
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  return (Number(m[1] || 0) * 3600) + (Number(m[2] || 0) * 60) + Number(m[3] || 0);
}
