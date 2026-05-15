import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "node:crypto";
import { getSession } from "@/lib/session";
import { PLATFORMS, type Platform } from "@/lib/platforms";
import { OAUTH_CONFIG, getRedirectUri } from "@/lib/oauth-config";
import { signState } from "@/lib/oauth-state";
import { getBaseUrl } from "@/lib/utils";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { platform } = await params;
  if (!PLATFORMS.includes(platform as Platform)) {
    return NextResponse.json({ error: "Unknown platform" }, { status: 400 });
  }

  const cfg = OAUTH_CONFIG[platform as Platform];
  const clientId = process.env[cfg.clientIdEnv];
  if (!clientId) {
    return NextResponse.json(
      {
        error: `${cfg.name} is not configured. Set ${cfg.clientIdEnv} and ${cfg.clientSecretEnv}.`,
      },
      { status: 501 }
    );
  }

  const baseUrl = getBaseUrl();
  const redirectUri = getRedirectUri(platform as Platform, baseUrl);

  const { state, codeVerifier } = signState({
    userId: session.user.id,
    platform,
  });

  const url = new URL(cfg.authUrl);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", cfg.scopes.join(" "));
  url.searchParams.set("state", state);

  if (cfg.pkce) {
    const challenge = createHash("sha256").update(codeVerifier).digest("base64url");
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  for (const [k, v] of Object.entries(cfg.extraAuthParams || {})) {
    url.searchParams.set(k, v);
  }

  // Store code verifier in short-lived cookie for PKCE flows
  const cookieStore = await cookies();
  cookieStore.set(`rr_pkce_${platform}`, codeVerifier, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 600,
    path: "/",
  });

  return NextResponse.json({ url: url.toString() });
}
