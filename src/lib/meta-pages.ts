import { nanoid } from "nanoid";
import { db } from "@/lib/db";
import { connection } from "@/lib/db/schema";
import { encryptSecret } from "@/lib/crypto";
import { META_GRAPH_BASE } from "@/lib/meta-graph";
import { createLogger } from "@/lib/logger";
import type { Platform } from "@/lib/platforms";

const log = createLogger({ scope: "meta-pages" });

/** Short-lived cookie holding the (encrypted) Meta user token while the user
 * picks which Page/account to connect. */
export const META_PICK_COOKIE = "rr_meta_pick";

/** A connectable account derived from an OAuth flow (a Page, IG account, channel…). */
export interface OAuthProfile {
  accountId: string;
  accountName: string;
  accountHandle: string | null;
  avatarUrl: string | null;
  metadata: Record<string, unknown> | null;
  /** For Meta this is the Page access token, stored (encrypted) as the connection token. */
  primaryToken?: string;
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
  let url: string | null = `${META_GRAPH_BASE}/me/accounts?fields=${encodeURIComponent(
    fields
  )}&limit=100&access_token=${encodeURIComponent(userToken)}`;

  while (url) {
    const res: Response = await fetch(url);
    if (!res.ok) {
      // A non-2xx here (dead/short-lived token, missing pages_show_list scope,
      // rate limit, transient 5xx) otherwise returns an empty list, which the
      // callback misreports to the operator as "you didn't tick a Page". Record
      // the real status so the cause is recoverable from the logs.
      const body = await res.text().catch(() => "");
      log.warn(
        { status: res.status, collected: pages.length, body: body.slice(0, 500) },
        "Meta GET /me/accounts failed while listing Pages — returning partial/empty list"
      );
      break;
    }
    const j = (await res.json()) as { data?: FbPage[]; paging?: { next?: string } };
    for (const p of j.data ?? []) pages.push(p);
    url = j.paging?.next ?? null;
    if (pages.length >= 500) {
      log.warn(
        { collected: pages.length },
        "Meta Page paging hit the 500 cap — list truncated"
      );
      break; // guard against a runaway paging cursor
    }
  }
  return pages;
}

/** Meta (Facebook Pages / Instagram Business accounts) connectable from a user token. */
export async function fetchMetaProfiles(
  platform: "facebook" | "instagram",
  userToken: string
): Promise<OAuthProfile[]> {
  try {
    if (platform === "facebook") {
      const pages = await fetchAllPages(userToken);
      return pages.map((page) => ({
        accountId: page.id,
        accountName: page.name || "Facebook Page",
        accountHandle: null,
        avatarUrl: page.picture?.data?.url || null,
        metadata: { pageId: page.id },
        primaryToken: page.access_token,
      }));
    }
    const pages = await fetchAllPages(userToken, true);
    return pages
      .filter((p) => p.instagram_business_account)
      .map((page) => {
        const ig = page.instagram_business_account!;
        return {
          accountId: ig.id,
          accountName: ig.username || page.name,
          accountHandle: ig.username || null,
          avatarUrl: ig.profile_picture_url || null,
          metadata: { igUserId: ig.id, pageId: page.id },
          primaryToken: page.access_token,
        };
      });
  } catch {
    return [];
  }
}

/** Upsert a single connection from an OAuth profile, encrypting tokens at rest. */
export async function saveConnectionProfile(opts: {
  userId: string;
  brandId: string | null;
  platform: Platform;
  profile: OAuthProfile;
  /** Used when the profile has no primaryToken (non-Meta platforms). */
  fallbackToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  scope: string;
}): Promise<void> {
  const tokenToStore = opts.profile.primaryToken ?? opts.fallbackToken;
  const encAccessToken = encryptSecret(tokenToStore);
  const encRefreshToken = opts.refreshToken
    ? encryptSecret(opts.refreshToken)
    : null;

  await db
    .insert(connection)
    .values({
      id: nanoid(),
      userId: opts.userId,
      brandId: opts.brandId,
      platform: opts.platform,
      accountId: opts.profile.accountId,
      accountName: opts.profile.accountName,
      accountHandle: opts.profile.accountHandle,
      avatarUrl: opts.profile.avatarUrl,
      accessToken: encAccessToken,
      refreshToken: encRefreshToken,
      accessTokenExpiresAt: opts.expiresAt ?? null,
      scope: opts.scope,
      metadata: opts.profile.metadata,
      isActive: true,
    })
    .onConflictDoUpdate({
      target: [connection.userId, connection.platform, connection.accountId],
      set: {
        brandId: opts.brandId,
        accountName: opts.profile.accountName,
        accountHandle: opts.profile.accountHandle,
        avatarUrl: opts.profile.avatarUrl,
        accessToken: encAccessToken,
        refreshToken: encRefreshToken,
        accessTokenExpiresAt: opts.expiresAt ?? null,
        scope: opts.scope,
        metadata: opts.profile.metadata,
        isActive: true,
        updatedAt: new Date(),
      },
    });
}
