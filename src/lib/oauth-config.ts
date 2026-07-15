import type { Platform } from "./platforms";
import { META_GRAPH_BASE, META_DIALOG_BASE } from "./meta-graph";

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
  /**
   * The query-param name for the client identifier. Standard OAuth is
   * `client_id`, but TikTok is non-standard and requires `client_key` on BOTH
   * the authorize URL and the token exchange. Defaults to `client_id`.
   */
  clientIdParam?: string;
  /**
   * Separator between requested scopes. Standard OAuth is a space, but TikTok
   * requires a comma. Defaults to a space.
   */
  scopeSeparator?: string;
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
    // `select_account` forces Google's account/brand chooser every time, so
    // whoever reconnects can explicitly pick the TEFL Heaven channel (incl. a
    // Brand Account) instead of Google silently reusing a cached personal login
    // and connecting the wrong channel. Lesson carried over from Switchboard.
    extraAuthParams: { access_type: "offline", prompt: "select_account consent" },
    pkce: false,
  },
  instagram: {
    name: "Instagram",
    authUrl: `${META_DIALOG_BASE}/dialog/oauth`,
    tokenUrl: `${META_GRAPH_BASE}/oauth/access_token`,
    // Meta deprecated instagram_basic / instagram_content_publish as direct
    // OAuth scopes in Login for Business. The Instagram Business account is
    // now reached via the linked Page's access token.
    scopes: [
      "pages_show_list",
      "pages_read_engagement",
      "pages_manage_posts",
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
    // TikTok deviates from standard OAuth: the client identifier param is
    // `client_key` (not `client_id`) on both authorize + token, and scopes are
    // comma-separated (not space-separated). Without these it returns
    // `param_error` / `error_type=client_key` at the authorize step.
    clientIdParam: "client_key",
    scopeSeparator: ",",
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
    authUrl: `${META_DIALOG_BASE}/dialog/oauth`,
    tokenUrl: `${META_GRAPH_BASE}/oauth/access_token`,
    scopes: ["pages_show_list", "pages_manage_posts", "pages_read_engagement"],
    clientIdEnv: "META_CLIENT_ID",
    clientSecretEnv: "META_CLIENT_SECRET",
    pkce: false,
  },
};

export function getRedirectUri(platform: Platform, baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, "")}/api/oauth/${platform}/callback`;
}
