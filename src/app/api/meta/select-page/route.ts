import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSession } from "@/lib/session";
import { decryptSecret } from "@/lib/crypto";
import { OAUTH_CONFIG } from "@/lib/oauth-config";
import {
  META_PICK_COOKIE,
  fetchMetaProfiles,
  saveConnectionProfile,
} from "@/lib/meta-pages";
import { createLogger } from "@/lib/logger";
import type { Platform } from "@/lib/platforms";

export const runtime = "nodejs";

const log = createLogger({ scope: "meta-select-page" });

/**
 * Finalize a Meta connection after the user picks ONE Page / IG account.
 * Reads the short-lived (encrypted) user token from the cookie set by the OAuth
 * callback, re-derives the chosen account's Page token, and saves just that one.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  const c = await cookies();
  const raw = c.get(META_PICK_COOKIE)?.value;
  if (!raw) {
    return NextResponse.json(
      { error: "Nothing to connect — start the connection again." },
      { status: 400 }
    );
  }
  let parsed: { platform: "facebook" | "instagram"; brandId: string | null; token: string };
  try {
    parsed = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Bad session." }, { status: 400 });
  }
  const userToken = decryptSecret(parsed.token);
  if (!userToken) {
    return NextResponse.json(
      { error: "That step expired — reconnect to try again." },
      { status: 400 }
    );
  }

  let body: { accountId?: string };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  if (!body.accountId) {
    return NextResponse.json({ error: "Pick an account." }, { status: 400 });
  }

  const profiles = await fetchMetaProfiles(parsed.platform, userToken);
  const profile = profiles.find((p) => p.accountId === body.accountId);
  if (!profile) {
    return NextResponse.json(
      { error: "That account is no longer available — reconnect." },
      { status: 404 }
    );
  }

  try {
    await saveConnectionProfile({
      userId: session.user.id,
      brandId: parsed.brandId,
      platform: parsed.platform as Platform,
      profile,
      fallbackToken: userToken,
      refreshToken: null,
      expiresAt: null, // Meta Page tokens (from a long-lived user token) don't expire
      scope: OAUTH_CONFIG[parsed.platform as Platform].scopes.join(" "),
    });
  } catch (err) {
    log.error(
      {
        platform: parsed.platform,
        accountId: body.accountId,
        err: err instanceof Error ? err.message : String(err),
      },
      "Failed to save Meta connection from page picker"
    );
    // Leave the pick cookie intact so the operator can retry.
    return NextResponse.json(
      { error: "Couldn't save that connection. Try again." },
      { status: 500 }
    );
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(META_PICK_COOKIE, "", { path: "/", maxAge: 0 }); // clear only after a confirmed save
  return res;
}
