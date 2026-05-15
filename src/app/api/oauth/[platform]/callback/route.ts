import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { nanoid } from "nanoid";
import { eq, and } from "drizzle-orm";
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

  // Fetch user info per-platform (best-effort scaffolding).
  const profile = await fetchProfile(platform as Platform, tokens.access_token);

  const expiresAt = tokens.expires_in
    ? new Date(Date.now() + (tokens.expires_in as number) * 1000)
    : null;

  await db
    .insert(connection)
    .values({
      id: nanoid(),
      userId: verified.userId,
      platform: platform as Platform,
      accountId: profile.accountId,
      accountName: profile.accountName,
      accountHandle: profile.accountHandle,
      avatarUrl: profile.avatarUrl,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      accessTokenExpiresAt: expiresAt,
      scope: (tokens.scope as string) ?? cfg.scopes.join(" "),
      metadata: profile.metadata,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: [connection.userId, connection.platform, connection.accountId],
      set: {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token ?? null,
        accessTokenExpiresAt: expiresAt,
        scope: (tokens.scope as string) ?? cfg.scopes.join(" "),
        isActive: true,
        updatedAt: new Date(),
      },
    });

  return NextResponse.redirect(new URL("/connections?connected=" + platform, baseUrl));
}

interface Profile {
  accountId: string;
  accountName: string;
  accountHandle: string | null;
  avatarUrl: string | null;
  metadata: Record<string, unknown> | null;
}

async function fetchProfile(platform: Platform, accessToken: string): Promise<Profile> {
  // Best-effort profile fetch per platform. Falls back to generic if API call fails.
  try {
    switch (platform) {
      case "youtube": {
        const res = await fetch(
          "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (res.ok) {
          const j = await res.json();
          const c = j.items?.[0];
          if (c) {
            return {
              accountId: c.id,
              accountName: c.snippet?.title || "YouTube channel",
              accountHandle: c.snippet?.customUrl || null,
              avatarUrl: c.snippet?.thumbnails?.default?.url || null,
              metadata: { channelId: c.id },
            };
          }
        }
        break;
      }
      case "linkedin": {
        const res = await fetch("https://api.linkedin.com/v2/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (res.ok) {
          const j = await res.json();
          return {
            accountId: j.sub,
            accountName: j.name || "LinkedIn",
            accountHandle: null,
            avatarUrl: j.picture || null,
            metadata: { urn: `urn:li:person:${j.sub}` },
          };
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
            return {
              accountId: u.open_id,
              accountName: u.display_name || "TikTok",
              accountHandle: u.username || null,
              avatarUrl: u.avatar_url || null,
              metadata: { unionId: u.union_id },
            };
          }
        }
        break;
      }
      case "facebook":
      case "instagram": {
        const res = await fetch(
          `https://graph.facebook.com/v19.0/me?fields=id,name,picture&access_token=${accessToken}`
        );
        if (res.ok) {
          const j = await res.json();
          return {
            accountId: j.id,
            accountName: j.name || platform,
            accountHandle: null,
            avatarUrl: j.picture?.data?.url || null,
            metadata: {},
          };
        }
        break;
      }
    }
  } catch {
    // fallthrough
  }
  return {
    accountId: `unknown-${Date.now()}`,
    accountName: `${platform} account`,
    accountHandle: null,
    avatarUrl: null,
    metadata: {},
  };
}

function redirectWithError(message: string) {
  const baseUrl = getBaseUrl();
  const url = new URL("/connections", baseUrl);
  url.searchParams.set("error", message.slice(0, 200));
  return NextResponse.redirect(url);
}
