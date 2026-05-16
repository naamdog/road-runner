import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { brand } from "@/lib/db/schema";
import { getSession } from "@/lib/session";
import { PLATFORMS, type Platform } from "@/lib/platforms";
import { OAUTH_CONFIG, getRedirectUri } from "@/lib/oauth-config";
import { signState } from "@/lib/oauth-state";
import { getBaseUrl } from "@/lib/utils";
import { getOrCreateBrands } from "@/lib/brands";
import { readActiveBrandCookie } from "@/lib/active-brand";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ platform: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  const { platform } = await params;
  if (!PLATFORMS.includes(platform as Platform)) {
    return NextResponse.json({ error: "Unknown app" }, { status: 400 });
  }

  // Resolve brand: explicit body brandId > active cookie > default
  const body = await req.json().catch(() => ({}));
  const requestedBrandId = (body?.brandId as string | undefined) ?? null;
  const brands = await getOrCreateBrands(session.user.id);
  let brandId: string;
  if (requestedBrandId) {
    const found = brands.find((b) => b.id === requestedBrandId);
    if (!found) {
      return NextResponse.json({ error: "Brand not found" }, { status: 404 });
    }
    brandId = found.id;
  } else {
    const cookieValue = await readActiveBrandCookie();
    brandId =
      brands.find((b) => b.id === cookieValue)?.id ??
      brands.find((b) => b.isDefault)?.id ??
      brands[0].id;
  }

  const cfg = OAUTH_CONFIG[platform as Platform];
  const clientId = process.env[cfg.clientIdEnv];
  if (!clientId) {
    return NextResponse.json(
      {
        error: `${cfg.name} is not set up. Add ${cfg.clientIdEnv} and ${cfg.clientSecretEnv} to your environment.`,
      },
      { status: 501 }
    );
  }

  const baseUrl = getBaseUrl();
  const redirectUri = getRedirectUri(platform as Platform, baseUrl);

  const { state, codeVerifier } = signState({
    userId: session.user.id,
    platform,
    brandId,
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
