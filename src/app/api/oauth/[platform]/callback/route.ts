import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { PLATFORMS, type Platform } from "@/lib/platforms";
import { OAUTH_CONFIG, getRedirectUri } from "@/lib/oauth-config";
import { verifyState } from "@/lib/oauth-state";
import { getBaseUrl } from "@/lib/utils";
import { encryptSecret } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";
import {
  META_PICK_COOKIE,
  fetchMetaProfiles,
  saveConnectionProfile,
  type OAuthProfile,
} from "@/lib/meta-pages";

const log = createLogger({ scope: "oauth-callback" });

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const { platform } = await params;
  if (!PLATFORMS.includes(platform as Platform)) {
    return redirectWithError("Unknown platform");
  }
  const cfg = OAUTH_CONFIG[platform as Platform];

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const errorParam = url.searchParams.get("error");

  if (errorParam) return redirectWithError(errorParam);
  if (!code || !state) return redirectWithError("Missing code or state");

  const verified = verifyState(state);
  if (!verified) return redirectWithError("Invalid state");
  if (verified.platform !== platform) {
    return redirectWithError("Platform mismatch");
  }

  const cookieStore = await cookies();
  const codeVerifier = cookieStore.get(`rr_pkce_${platform}`)?.value;
  cookieStore.delete(`rr_pkce_${platform}`);

  const clientId = process.env[cfg.clientIdEnv];
  const clientSecret = process.env[cfg.clientSecretEnv];
  if (!clientId || !clientSecret) {
    return redirectWithError(`${cfg.name} is not configured`);
  }

  const baseUrl = getBaseUrl();
  const redirectUri = getRedirectUri(platform as Platform, baseUrl);

  // Exchange code for tokens
  const tokenBody = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  if (cfg.pkce && codeVerifier) {
    tokenBody.set("code_verifier", codeVerifier);
  }

  let tokens: {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
    [k: string]: unknown;
  };
  try {
    const res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: tokenBody.toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      return redirectWithError(`Token exchange failed: ${text.slice(0, 200)}`);
    }
    tokens = await res.json();
  } catch (err) {
    return redirectWithError(
      err instanceof Error ? err.message : "Token exchange failed"
    );
  }

  if (!tokens.access_token) {
    return redirectWithError("No access token returned");
  }

  // For Meta, exchange short-lived user token for a long-lived one BEFORE
  // fetching pages — page access tokens derived from a long-lived user token
  // are themselves long-lived (don't expire as long as permissions hold).
  let userToken = tokens.access_token;
  if (platform === "facebook" || platform === "instagram") {
    try {
      const longRes = await fetch(
        `https://graph.facebook.com/v19.0/oauth/access_token?` +
          new URLSearchParams({
            grant_type: "fb_exchange_token",
            client_id: clientId,
            client_secret: clientSecret,
            fb_exchange_token: tokens.access_token,
          }).toString()
      );
      if (longRes.ok) {
        const j = (await longRes.json()) as { access_token?: string };
        if (j.access_token) {
          userToken = j.access_token;
        } else {
          log.warn(
            { platform },
            "Meta long-lived token exchange returned no access_token; falling back to short-lived user token — re-auth will be needed sooner"
          );
        }
      } else {
        log.warn(
          { platform, status: longRes.status },
          "Meta long-lived token exchange failed; falling back to short-lived user token — re-auth will be needed sooner"
        );
      }
    } catch (err) {
      // fall back to short-lived; it still works for testing
      log.warn(
        { platform, err: err instanceof Error ? err.message : String(err) },
        "Meta long-lived token exchange threw; falling back to short-lived user token — re-auth will be needed sooner"
      );
    }
  }

  const profiles = await fetchProfiles(platform as Platform, userToken);

  if (profiles.length === 0) {
    return redirectWithError(noProfilesError(platform as Platform));
  }

  const isMeta = platform === "facebook" || platform === "instagram";
  const scope = (tokens.scope as string) ?? cfg.scopes.join(" ");
  // Meta Page tokens (derived from the long-lived user token) don't expire;
  // only non-Meta tokens carry a meaningful expiry to store.
  const expiresAt =
    !isMeta && tokens.expires_in
      ? new Date(Date.now() + (tokens.expires_in as number) * 1000)
      : null;

  // Meta with MORE THAN ONE Page / IG account: let the user pick exactly one
  // (cleaner than auto-adding every Page they manage). Stash the encrypted user
  // token briefly and hand off to the chooser page.
  if (isMeta && profiles.length > 1) {
    const res = NextResponse.redirect(new URL("/connections/choose-page", baseUrl));
    res.cookies.set(
      META_PICK_COOKIE,
      JSON.stringify({
        platform,
        brandId: verified.brandId,
        token: encryptSecret(userToken),
      }),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 600,
        path: "/",
      }
    );
    return res;
  }

  // Single account (or non-Meta): save it directly.
  for (const profile of profiles) {
    await saveConnectionProfile({
      userId: verified.userId,
      brandId: verified.brandId,
      platform: platform as Platform,
      profile,
      fallbackToken: userToken,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt,
      scope,
    });
  }

  const redirect = new URL("/connections", baseUrl);
  redirect.searchParams.set("connected", platform);
  redirect.searchParams.set("count", String(profiles.length));
  return NextResponse.redirect(redirect);
}

async function fetchProfiles(
  platform: Platform,
  accessToken: string
): Promise<OAuthProfile[]> {
  try {
    switch (platform) {
      case "youtube": {
        const res = await fetch(
          "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (res.ok) {
          const j = await res.json();
          return (j.items ?? [])
            .filter(Boolean)
            .map(
              (c: {
                id: string;
                snippet?: {
                  title?: string;
                  customUrl?: string;
                  thumbnails?: { default?: { url?: string } };
                };
              }) => ({
                accountId: c.id,
                accountName: c.snippet?.title || "YouTube channel",
                accountHandle: c.snippet?.customUrl || null,
                avatarUrl: c.snippet?.thumbnails?.default?.url || null,
                metadata: { channelId: c.id },
              })
            );
        }
        break;
      }
      case "linkedin": {
        const res = await fetch("https://api.linkedin.com/v2/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok) {
          const j = (await res.json()) as {
            sub?: string;
            name?: string;
            picture?: string;
          };
          // URN is required to publish on LinkedIn; refuse to save a broken
          // connection if the member id can't be resolved.
          if (!j.sub) break;
          return [
            {
              accountId: j.sub,
              accountName: j.name || "LinkedIn",
              accountHandle: null,
              avatarUrl: j.picture || null,
              metadata: { urn: `urn:li:person:${j.sub}` },
            },
          ];
        }
        break;
      }
      case "tiktok": {
        const res = await fetch(
          "https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name,username",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (res.ok) {
          const j = await res.json();
          const u = j.data?.user;
          if (u) {
            return [
              {
                accountId: u.open_id,
                accountName: u.display_name || "TikTok",
                accountHandle: u.username || null,
                avatarUrl: u.avatar_url || null,
                metadata: { unionId: u.union_id },
              },
            ];
          }
        }
        break;
      }
      case "facebook":
        return fetchMetaProfiles("facebook", accessToken);
      case "instagram":
        return fetchMetaProfiles("instagram", accessToken);
    }
  } catch {
    // fall through to empty list
  }
  return [];
}

function noProfilesError(platform: Platform): string {
  if (platform === "facebook") {
    return "No Facebook Pages found. Make sure you ticked at least one Page during the sign-in popup, and that your account is an admin of it.";
  }
  if (platform === "instagram") {
    return "No Instagram Business accounts found. Your Instagram must be a Business/Creator account linked to a Facebook Page you admin.";
  }
  if (platform === "linkedin") {
    return "Couldn't resolve your LinkedIn member URN. Reconnect and grant profile access.";
  }
  return `${platform} returned no accounts`;
}

function redirectWithError(message: string) {
  const baseUrl = getBaseUrl();
  const url = new URL("/connections", baseUrl);
  url.searchParams.set("error", message.slice(0, 200));
  return NextResponse.redirect(url);
}
