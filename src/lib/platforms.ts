export type Platform =
  | "youtube"
  | "instagram"
  | "tiktok"
  | "linkedin"
  | "facebook";

export const PLATFORMS = [
  "youtube",
  "instagram",
  "tiktok",
  "linkedin",
  "facebook",
] as const satisfies readonly Platform[];

export interface PlatformMeta {
  id: Platform;
  name: string;
  shortName: string;
  surface: string;
  brand: string; // hex
  brandRgb: string;
  shortFormatLabel: string; // e.g. "Shorts", "Reels", "TikTok"
  maxCaptionLength: number;
  hashtagLimit: number;
  videoSpecs: {
    aspectRatios: string[];
    maxDurationSec: number;
    minDurationSec: number;
    maxSizeMb: number;
  };
}

export const PLATFORM_META: Record<Platform, PlatformMeta> = {
  youtube: {
    id: "youtube",
    name: "YouTube Shorts",
    shortName: "Shorts",
    surface: "youtube",
    brand: "#FF0033",
    brandRgb: "255 0 51",
    shortFormatLabel: "Shorts",
    maxCaptionLength: 100,
    hashtagLimit: 15,
    videoSpecs: {
      aspectRatios: ["9:16"],
      maxDurationSec: 60,
      minDurationSec: 1,
      maxSizeMb: 256,
    },
  },
  instagram: {
    id: "instagram",
    name: "Instagram Reels",
    shortName: "Reels",
    surface: "instagram",
    brand: "#E1306C",
    brandRgb: "225 48 108",
    shortFormatLabel: "Reels",
    maxCaptionLength: 2200,
    hashtagLimit: 30,
    videoSpecs: {
      aspectRatios: ["9:16", "1:1", "4:5"],
      maxDurationSec: 90,
      minDurationSec: 3,
      maxSizeMb: 100,
    },
  },
  tiktok: {
    id: "tiktok",
    name: "TikTok",
    shortName: "TikTok",
    surface: "tiktok",
    brand: "#FF0050",
    brandRgb: "255 0 80",
    shortFormatLabel: "TikTok",
    maxCaptionLength: 2200,
    hashtagLimit: 30,
    videoSpecs: {
      aspectRatios: ["9:16"],
      maxDurationSec: 180,
      minDurationSec: 3,
      maxSizeMb: 287,
    },
  },
  linkedin: {
    id: "linkedin",
    name: "LinkedIn",
    shortName: "LinkedIn",
    surface: "linkedin",
    brand: "#0A66C2",
    brandRgb: "10 102 194",
    shortFormatLabel: "Video Post",
    maxCaptionLength: 3000,
    hashtagLimit: 30,
    videoSpecs: {
      aspectRatios: ["9:16", "1:1", "16:9"],
      maxDurationSec: 600,
      minDurationSec: 3,
      maxSizeMb: 5120,
    },
  },
  facebook: {
    id: "facebook",
    name: "Facebook Page",
    shortName: "FB Pages",
    surface: "facebook",
    brand: "#1877F2",
    brandRgb: "24 119 242",
    shortFormatLabel: "Reels",
    maxCaptionLength: 63206,
    hashtagLimit: 30,
    videoSpecs: {
      aspectRatios: ["9:16"],
      maxDurationSec: 90,
      minDurationSec: 3,
      maxSizeMb: 1024,
    },
  },
};

export function maxCaptionForPlatforms(platforms: Platform[]): number {
  return Math.min(
    ...platforms.map((p) => PLATFORM_META[p].maxCaptionLength),
    Infinity
  );
}

export type PostStatus =
  | "draft"
  | "scheduled"
  | "publishing"
  | "published"
  | "failed"
  | "canceled";

export const POST_STATUS_LABEL: Record<PostStatus, string> = {
  draft: "Draft",
  scheduled: "Scheduled",
  publishing: "Publishing",
  published: "Published",
  failed: "Failed",
  canceled: "Canceled",
};
