import type { Platform } from "@/lib/platforms";
import { PLATFORM_META } from "@/lib/platforms";
import { cn } from "@/lib/utils";

interface PlatformIconProps {
  platform: Platform;
  size?: number;
  className?: string;
  tone?: "color" | "mono";
}

/**
 * Inline SVG icons for each platform — no external assets, no licensing concerns,
 * and the color is controlled via Tailwind classes / CSS variables.
 *
 * Marks are simplified geometric interpretations to avoid trademark issues
 * while still being recognizable.
 */
export function PlatformIcon({
  platform,
  size = 18,
  className,
  tone = "color",
}: PlatformIconProps) {
  const fill = tone === "color" ? PLATFORM_META[platform].brand : "currentColor";

  const props = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
    "aria-label": PLATFORM_META[platform].name,
    role: "img",
    className: cn("shrink-0", className),
  };

  switch (platform) {
    case "youtube":
      return (
        <svg {...props}>
          <rect x="2" y="5" width="20" height="14" rx="4" fill={fill} />
          <path d="M10 9.5v5l4.5-2.5L10 9.5z" fill="#0a0a0b" />
        </svg>
      );
    case "instagram":
      return (
        <svg {...props}>
          <defs>
            <linearGradient id={`ig-${size}`} x1="0" y1="24" x2="24" y2="0" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#FEDA75" />
              <stop offset="0.25" stopColor="#FA7E1E" />
              <stop offset="0.5" stopColor="#D62976" />
              <stop offset="0.75" stopColor="#962FBF" />
              <stop offset="1" stopColor="#4F5BD5" />
            </linearGradient>
          </defs>
          <rect x="3" y="3" width="18" height="18" rx="5" fill={tone === "color" ? `url(#ig-${size})` : fill} />
          <circle cx="12" cy="12" r="4" stroke="#fff" strokeWidth="2" />
          <circle cx="17.2" cy="6.8" r="1" fill="#fff" />
        </svg>
      );
    case "tiktok":
      return (
        <svg {...props}>
          <path
            d="M16.5 3v3.5a4 4 0 003.5 3.5v3a7 7 0 01-3.5-1V15a6 6 0 11-6-6h.5v3.2H10A2.8 2.8 0 1012.8 15V3h3.7z"
            fill={fill}
          />
        </svg>
      );
    case "linkedin":
      return (
        <svg {...props}>
          <rect x="2" y="2" width="20" height="20" rx="3" fill={fill} />
          <path
            d="M7 10v8M7 7v.01M11 18v-5a2 2 0 014 0v5M11 10v8"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "facebook":
      return (
        <svg {...props}>
          <rect x="2" y="2" width="20" height="20" rx="4" fill={fill} />
          <path
            d="M13.5 21v-7h2.4l.4-3h-2.8V9.2c0-.9.3-1.5 1.6-1.5h1.6V5.1c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.4-4 4v2H8v3h2.3v7h3.2z"
            fill="#fff"
          />
        </svg>
      );
  }
}
