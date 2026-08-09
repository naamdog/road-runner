/**
 * Client-safe pieces of the Blotato model.
 *
 * `blotato.ts` is `server-only` because it carries the API key, so anything the
 * browser needs — types, labels, colours, the video identity rule — lives here
 * and is re-exported from the server module for convenience.
 */

export type Platform = "facebook" | "instagram" | "tiktok" | "youtube" | "linkedin";

export interface Account {
  id: string;
  platform: Platform;
  username: string;
  fullname: string;
}

export interface ScheduledPost {
  id: string;
  scheduledAt: string;
  platform: Platform;
  text: string;
  mediaUrl: string | null;
  accountLabel: string;
  avatarUrl: string | null;
}

export interface QueuePost {
  id: string;
  platform: Platform;
  text: string;
  mediaUrl: string | null;
  postTime: string | null;
  state: "scheduled" | "failed" | "published" | string;
  error: string | null;
}

/** Starter plan ceiling. The queue is capped, so the app surfaces it prominently. */
export const SCHEDULE_LIMIT = 200;

/**
 * Identifies one underlying video. A single clip is posted to several platforms
 * at the same minute; Blotato stores a separate copy per post, so the media URL
 * can't be used to tell them apart — the caption and time can.
 */
export function videoKey(p: { text: string; scheduledAt: string }): string {
  return `${p.scheduledAt}|${p.text}`;
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok",
  youtube: "YouTube", linkedin: "LinkedIn",
};

export const PLATFORM_COLOR: Record<Platform, string> = {
  facebook: "#1877F2", instagram: "#E1306C", tiktok: "#FF0050",
  youtube: "#FF0033", linkedin: "#0A66C2",
};
