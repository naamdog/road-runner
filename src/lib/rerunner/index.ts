import type { Fetcher } from "./types";
import type { Platform } from "../platforms";
import { fetchYouTubePopular } from "./youtube";
import { fetchInstagramPopular } from "./instagram";
import { fetchTikTokPopular } from "./tiktok";
import { fetchLinkedInPopular } from "./linkedin";
import { fetchFacebookPopular } from "./facebook";

export const fetchers: Record<Platform, Fetcher> = {
  youtube: fetchYouTubePopular,
  instagram: fetchInstagramPopular,
  tiktok: fetchTikTokPopular,
  linkedin: fetchLinkedInPopular,
  facebook: fetchFacebookPopular,
};

export * from "./types";
