import type { Fetcher, PopularVideo } from "./types";
import { FetcherError } from "./types";

/**
 * Fetch the user's recent Facebook Page videos (Reels).
 *
 * Uses /{page-id}/videos which returns metadata + a `source` URL for the
 * underlying file. We then call /video_insights per video to get view counts
 * (best-effort — Pages with low traffic may not have all metrics).
 */
export const fetchFacebookPopular: Fetcher = async ({
  accessToken,
  metadata,
  connectionId,
  accountName,
  accountHandle,
  limit,
}) => {
  const pageId = (metadata?.pageId as string) || (metadata?.accountId as string);
  if (!pageId) return [];

  const fields = [
    "id",
    "description",
    "title",
    "source",
    "picture",
    "permalink_url",
    "length",
    "created_time",
    "comments.summary(total_count).limit(0)",
    "likes.summary(total_count).limit(0)",
  ].join(",");

  const url = new URL(`https://graph.facebook.com/v19.0/${pageId}/videos`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("limit", String(Math.min(limit * 2, 50)));
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url);
  if (!res.ok) {
    throw new FetcherError(`Facebook fetch failed (${res.status})`, "facebook");
  }
  const json = await res.json();
  const items: FBVideo[] = json.data || [];

  // Best-effort views via insights; fail silently per-video.
  const withViews = await Promise.all(
    items.slice(0, limit).map(async (v) => {
      let views: number | null = null;
      try {
        const insightsRes = await fetch(
          `https://graph.facebook.com/v19.0/${v.id}/video_insights?metric=total_video_views&access_token=${accessToken}`
        );
        if (insightsRes.ok) {
          const j = await insightsRes.json();
          views = j.data?.[0]?.values?.[0]?.value ?? null;
        }
      } catch {
        // ignore
      }
      return { v, views };
    })
  );

  const popular = withViews
    .map(({ v, views }): PopularVideo => ({
      id: `facebook:${v.id}`,
      platform: "facebook",
      externalId: v.id,
      caption: v.description || v.title || "",
      title: v.title || null,
      permalinkUrl: v.permalink_url || `https://www.facebook.com/${v.id}`,
      thumbnailUrl: v.picture || null,
      videoUrl: v.source || null,
      canAutoDownload: Boolean(v.source),
      durationSec: v.length ? Math.round(v.length) : null,
      publishedAt: v.created_time || null,
      views,
      likes: v.likes?.summary?.total_count ?? null,
      comments: v.comments?.summary?.total_count ?? null,
      shares: null,
      accountName,
      accountHandle,
      connectionId,
    }))
    .sort((a, b) => (b.views ?? b.likes ?? 0) - (a.views ?? a.likes ?? 0));

  return popular;
};

interface FBVideo {
  id: string;
  title?: string;
  description?: string;
  source?: string;
  picture?: string;
  permalink_url?: string;
  length?: number;
  created_time?: string;
  comments?: { summary?: { total_count?: number } };
  likes?: { summary?: { total_count?: number } };
}
