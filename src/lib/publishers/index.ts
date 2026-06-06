import type { Platform } from "../platforms";
import type { Publisher, TokenRefresher } from "./types";
import { publishYouTube, refreshYouTube } from "./youtube";
import { publishInstagram } from "./instagram";
import { publishTikTok, refreshTikTok } from "./tiktok";
import { publishLinkedIn, refreshLinkedIn } from "./linkedin";
import { publishFacebook } from "./facebook";

export const publishers: Record<Platform, Publisher> = {
  youtube: publishYouTube,
  instagram: publishInstagram,
  tiktok: publishTikTok,
  linkedin: publishLinkedIn,
  facebook: publishFacebook,
};

export const refreshers: Partial<Record<Platform, TokenRefresher>> = {
  youtube: refreshYouTube,
  linkedin: refreshLinkedIn,
  tiktok: refreshTikTok,
};

export * from "./types";
