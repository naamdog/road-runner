import type { Platform } from "../platforms";

/**
 * A short-form video pulled from a connected platform, ready to be re-run.
 */
export interface PopularVideo {
  /** Stable id across this Road Runner instance: `${platform}:${externalId}` */
  id: string;
  platform: Platform;
  /** Platform's native post/video id. */
  externalId: string;
  /** Caption / description from the platform. */
  caption: string;
  /** Optional title (YouTube) — falls back to caption. */
  title: string | null;
  /** Public URL to view the original post. */
  permalinkUrl: string;
  /** Thumbnail URL — used for the grid card. */
  thumbnailUrl: string | null;
  /** Direct video URL if the API exposes it. Null means manual download required. */
  videoUrl: string | null;
  /** Whether we can fetch the bytes server-side without browser interaction. */
  canAutoDownload: boolean;
  /** Duration in seconds, if known. */
  durationSec: number | null;
  /** When the post was published on the platform (ISO). */
  publishedAt: string | null;
  /** Engagement metrics — null if the platform doesn't expose them on the list endpoint. */
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  /** Which connected account this belongs to (for display). */
  accountName: string;
  accountHandle: string | null;
  /** Connection record id, so we can re-use it on re-post. */
  connectionId: string;
}

/**
 * Combined ranking metric. Higher = more popular.
 * Uses views primarily; falls back to likes×10 if views aren't exposed.
 */
export function popularityScore(v: PopularVideo): number {
  if (v.views !== null) return v.views;
  if (v.likes !== null) return v.likes * 10;
  if (v.comments !== null) return v.comments * 50;
  return 0;
}

export class FetcherError extends Error {
  constructor(message: string, public platform: Platform) {
    super(message);
    this.name = "FetcherError";
  }
}

export interface FetcherInput {
  connectionId: string;
  accessToken: string;
  refreshToken: string | null;
  metadata: Record<string, unknown> | null;
  accountId: string;
  accountName: string;
  accountHandle: string | null;
  /** Max items to return (the fetcher may return fewer). */
  limit: number;
}

export type Fetcher = (input: FetcherInput) => Promise<PopularVideo[]>;
