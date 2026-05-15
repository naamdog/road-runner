import type { Platform } from "./platforms";

export interface OAuthConfig {
  /** Display name. */
  name: string;
  /** Authorization endpoint. */
  authUrl: string;
  /** Token exchange endpoint. */
  tokenUrl: string;
  /** Scopes to request. */
  scopes: string[];
  /** Client ID env var name. */
  clientIdEnv: string;
  /** Client secret env var name. */
  clientSecretEnv: string;
  /** Additional auth URL parameters. */
  extraAuthParams?: Record<string, string>;
  /** PKCE required? */
  pkce: boolean;
}

export const OAUTH_CONFIG: Record<Platform, OAuthConfig> = {
  youtube: {
    name: "Google / YouTube",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scopes: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.readonly",
      "openid",
      "email",
      "profile",
    ],
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    extraAuthParams: { access_type: "offline", prompt: "consent" },
    pkce: false,
  },
  instagram: {
    name: "Instagram",
    authUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
    scopes: [
      "instagram_basic",
      "instagram_content_publish",
      "pages_show_list",
      "business_management",
    ],
    clientIdEnv: "META_CLIENT_ID",
    clientSecretEnv: "META_CLIENT_SECRET",
    pkce: false,
  },
  tiktok: {
    name: "TikTok",
    authUrl: "https://www.tiktok.com/v2/auth/authorize",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    scopes: ["user.info.basic", "video.upload", "video.publish"],
    clientIdEnv: "TIKTOK_CLIENT_KEY",
    clientSecretEnv: "TIKTOK_CLIENT_SECRET",
    pkce: true,
  },
  linkedin: {
    name: "LinkedIn",
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    scopes: ["openid", "profile", "email", "w_member_social"],
    clientIdEnv: "LINKEDIN_CLIENT_ID",
    clientSecretEnv: "LINKEDIN_CLIENT_SECRET",
    pkce: false,
  },
  facebook: {
    name: "Facebook",
    authUrl: "https://www.facebook.com/v19.0/dialog/oauth",
    tokenUrl: "https://graph.facebook.com/v19.0/oauth/access_token",
    scopes: ["pages_show_list", "pages_manage_posts", "pages_read_engagement"],
    clientIdEnv: "META_CLIENT_ID",
    clientSecretEnv: "META_CLIENT_SECRET",
    pkce: false,
  },
};

export function getRedirectUri(platform: Platform, baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/oauth/${platform}/callback`;
}
