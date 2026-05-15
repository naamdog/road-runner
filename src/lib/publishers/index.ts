import type { Platform } from "../platforms";
import type { Publisher } from "./types";
import { publishYouTube } from "./youtube";
import { publishInstagram } from "./instagram";
import { publishTikTok } from "./tiktok";
import { publishLinkedIn } from "./linkedin";
import { publishFacebook } from "./facebook";

export const publishers: Record<Platform, Publisher> = {
  youtube: publishYouTube,
  instagram: publishInstagram,
  tiktok: publishTikTok,
  linkedin: publishLinkedIn,
  facebook: publishFacebook,
};

export * from "./types";
