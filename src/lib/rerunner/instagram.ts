import type { Fetcher, PopularVideo } from "./types";
import { FetcherError } from "./types";

/**
 * Fetch the user's recent Reels with engagement metrics.
 *
 * Sorted by like_count (descending) since the IG Graph API doesn't support
 * order parameters and view counts require a separate /insights call.
 *
 * We pull the most recent N, then sort client-side; for accounts with deep
 * archives this can miss old viral hits. That's an acceptable trade for
 * latency on a typical creator account.
 */
export const fetchInstagramPopular: Fetcher = async ({
  accessToken,
  metadata,
  connectionId,
  accountName,
  accountHandle,
  limit,
}) => {
  const igUserId = (metadata?.igUserId as string) || (metadata?.businessAccountId as string);
  if (!igUserId) return [];

  const fields = [
    "id",
    "caption",
    "media_type",
    "media_product_type",
    "media_url",
    "permalink",
    "thumbnail_url",
    "timestamp",
    "like_count",
    "comments_count",
  ].join(",");

  const url = new URL(`https://graph.facebook.com/v19.0/${igUserId}/media`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("limit", String(Math.min(limit * 3, 100))); // overfetch then filter
  url.searchParams.set("access_token", accessToken);

  const res = await fetch(url);
  if (!res.ok) {
    throw new FetcherError(
      `Instagram fetch failed (${res.status})`,
      "instagram"
    );
  }
  const json = await res.json();
  const items: IGMedia[] = json.data || [];

  const reels = items
    .filter(
      (it) =>
        it.media_type === "VIDEO" ||
        it.media_product_type === "REELS"
    )
    .sort((a, b) => (b.like_count ?? 0) - (a.like_count ?? 0))
    .slice(0, limit);

  return reels.map((it): PopularVideo => ({
    id: `instagram:${it.id}`,
    platform: "instagram",
    externalId: it.id,
    caption: it.caption ?? "",
    title: null,
    permalinkUrl: it.permalink,
    thumbnailUrl: it.thumbnail_url ?? null,
    videoUrl: it.media_url ?? null,
    canAutoDownload: Boolean(it.media_url),
    durationSec: null,
    publishedAt: it.timestamp ?? null,
    views: null, // requires /{id}/insights — separate call
    likes: it.like_count ?? null,
    comments: it.comments_count ?? null,
    shares: null,
    accountName,
    accountHandle,
    connectionId,
  }));
};

interface IGMedia {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  media_url?: string;
  permalink: string;
  thumbnail_url?: string;
  timestamp?: string;
  like_count?: number;
  comments_count?: number;
}
