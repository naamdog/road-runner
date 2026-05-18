import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { connection } from "@/lib/db/schema";
import { PLATFORMS, type Platform } from "@/lib/platforms";
import { OAUTH_CONFIG, getRedirectUri } from "@/lib/oauth-config";
import { verifyState } from "@/lib/oauth-state";
import { getBaseUrl } from "@/lib/utils";

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
        if (j.access_token) userToken = j.access_token;
      }
    } catch {
      // fall back to short-lived; it still works for testing
    }
  }

  const profiles = await fetchProfiles(platform as Platform, userToken);

  if (profiles.length === 0) {
    return redirectWithError(noProfilesError(platform as Platform));
  }

  let saved = 0;
  for (const profile of profiles) {
    // For Meta, the connection's stored access token should be the Page token
    // so publishers (which use connection.accessToken) call the right APIs.
    const tokenToStore = profile.primaryToken ?? userToken;
    const expiresAt = tokens.expires_in
      ? new Date(Date.now() + (tokens.expires_in as number) * 1000)
      : null;

    await db
      .insert(connection)
      .values({
        id: nanoid(),
        userId: verified.userId,
        brandId: verified.brandId,
        platform: platform as Platform,
        accountId: profile.accountId,
        accountName: profile.accountName,
        accountHandle: profile.accountHandle,
        avatarUrl: profile.avatarUrl,
        accessToken: tokenToStore,
        refreshToken: tokens.refresh_token ?? null,
        accessTokenExpiresAt: expiresAt,
        scope: (tokens.scope as string) ?? cfg.scopes.join(" "),
        metadata: profile.metadata,
        isActive: true,
      })
      .onConflictDoUpdate({
        target: [connection.userId, connection.platform, connection.accountId],
        set: {
          brandId: verified.brandId,
          accountName: profile.accountName,
          accountHandle: profile.accountHandle,
          avatarUrl: profile.avatarUrl,
          accessToken: tokenToStore,
          refreshToken: tokens.refresh_token ?? null,
          accessTokenExpiresAt: expiresAt,
          scope: (tokens.scope as string) ?? cfg.scopes.join(" "),
          metadata: profile.metadata,
          isActive: true,
          updatedAt: new Date(),
        },
      });
    saved++;
  }

  const redirect = new URL("/connections", baseUrl);
  redirect.searchParams.set("connected", platform);
  redirect.searchParams.set("count", String(saved));
  return NextResponse.redirect(redirect);
}

interface Profile {
  accountId: string;
  accountName: string;
  accountHandle: string | null;
  avatarUrl: string | null;
  metadata: Record<string, unknown> | null;
  /** When set, used as the connection's primary access token instead of the
   * user OAuth token. For Meta this is the Page access token. */
  primaryToken?: string;
}

async function fetchProfiles(
  platform: Platform,
  accessToken: string
): Promise<Profile[]> {
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
            sub: string;
            name?: string;
            picture?: string;
          };
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
      case "facebook": {
        // Return EVERY Page the user granted access to as its own connection.
        const pages = await fetchAllPages(accessToken);
        return pages.map((page) => ({
          accountId: page.id,
          accountName: page.name || "Facebook Page",
          accountHandle: null,
          avatarUrl: page.picture?.data?.url || null,
          metadata: { pageId: page.id, pageAccessToken: page.access_token },
          primaryToken: page.access_token,
        }));
      }
      case "instagram": {
        // Every Page that has a linked Instagram Business account becomes its
        // own IG connection (the IG account, posted via the Page token).
        const pages = await fetchAllPages(accessToken, true);
        return pages
          .filter((p) => p.instagram_business_account)
          .map((page) => {
            const ig = page.instagram_business_account!;
            return {
              accountId: ig.id,
              accountName: ig.username || page.name,
              accountHandle: ig.username || null,
              avatarUrl: ig.profile_picture_url || null,
              metadata: {
                igUserId: ig.id,
                pageId: page.id,
                pageAccessToken: page.access_token,
              },
              primaryToken: page.access_token,
            };
          });
      }
    }
  } catch {
    // fall through to empty list
  }
  return [];
}

type FbPage = {
  id: string;
  name: string;
  access_token: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: {
    id: string;
    username?: string;
    profile_picture_url?: string;
  };
};

/** Paginated fetch of every Page the user manages. */
async function fetchAllPages(
  userToken: string,
  includeIg = false
): Promise<FbPage[]> {
  const fields = includeIg
    ? "id,name,access_token,picture,instagram_business_account{id,username,profile_picture_url}"
    : "id,name,access_token,picture";

  const pages: FbPage[] = [];
  let url:
    | string
    | null =
    `https://graph.facebook.com/v19.0/me/accounts?fields=${encodeURIComponent(fields)}&limit=100&access_token=${encodeURIComponent(userToken)}`;

  while (url) {
    const res: Response = await fetch(url);
    if (!res.ok) break;
    const j = (await res.json()) as {
      data?: FbPage[];
      paging?: { next?: string };
    };
    for (const p of j.data ?? []) pages.push(p);
    url = j.paging?.next ?? null;
    // Cap so a malformed paging cursor can't loop forever.
    if (pages.length >= 500) break;
  }
  return pages;
}

function noProfilesError(platform: Platform): string {
  if (platform === "facebook") {
    return "No Facebook Pages found. Make sure you ticked at least one Page during the sign-in popup, and that your account is an admin of it.";
  }
  if (platform === "instagram") {
    return "No Instagram Business accounts found. Your Instagram must be a Business/Creator account linked to a Facebook Page you admin.";
  }
  return `${platform} returned no accounts`;
}

function redirectWithError(message: string) {
  const baseUrl = getBaseUrl();
  const url = new URL("/connections", baseUrl);
  url.searchParams.set("error", message.slice(0, 200));
  return NextResponse.redirect(url);
}
