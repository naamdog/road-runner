import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE, verifyToken } from "@/lib/gate";
import { getAccounts, type Platform } from "@/lib/blotato";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Schedule one video across several platforms.
 *
 * Called once per video so the browser can show real progress and keep going if
 * a single one fails. Account ids are resolved here rather than trusted from the
 * client, and the Facebook Page id comes from Blotato's own subaccount list.
 */

interface Body {
  mediaUrl: string;
  caption: string;
  title?: string;
  /** ISO instant the post should go out. */
  when: string;
  platforms: Platform[];
}

function target(platform: Platform, title: string, pageId?: string) {
  switch (platform) {
    case "facebook":
      return { targetType: "facebook", pageId, mediaType: "reel" };
    case "youtube":
      return {
        targetType: "youtube",
        title: `${title.slice(0, 91)} #Shorts`,
        privacyStatus: "public",
        shouldNotifySubscribers: false,
      };
    case "instagram":
      return { targetType: "instagram", mediaType: "reel" };
    case "tiktok":
      return {
        targetType: "tiktok",
        privacyLevel: "PUBLIC_TO_EVERYONE",
        disabledComments: false, disabledDuet: false, disabledStitch: false,
        isBrandedContent: false, isYourBrand: false, isAiGenerated: false,
      };
    default:
      return { targetType: platform };
  }
}

export async function POST(req: NextRequest) {
  const jar = await cookies();
  if (!verifyToken(jar.get(COOKIE)?.value)) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  const key = process.env.BLOTATO_API_KEY;
  if (!key) return NextResponse.json({ error: "BLOTATO_API_KEY not set" }, { status: 500 });

  const body = (await req.json()) as Body;
  if (!body.mediaUrl || !body.when || !body.platforms?.length) {
    return NextResponse.json({ error: "Missing mediaUrl, when or platforms" }, { status: 400 });
  }

  const accounts = await getAccounts();
  const byPlatform = new Map(accounts.map((a) => [a.platform, a.id]));

  // Facebook posts to a Page, not the connected profile — fetch its id.
  let pageId: string | undefined;
  if (body.platforms.includes("facebook") && byPlatform.get("facebook")) {
    try {
      const r = await fetch(
        `https://backend.blotato.com/v2/users/me/accounts/${byPlatform.get("facebook")}/subaccounts`,
        { headers: { "blotato-api-key": key }, cache: "no-store" }
      );
      const j = (await r.json()) as { items?: Array<{ id: string; name: string }> };
      // Prefer a Page whose name looks like the brand, else the first one.
      const items = j.items ?? [];
      pageId = (items.find((i) => /tefl/i.test(i.name)) ?? items[0])?.id;
    } catch {
      /* fall through; Blotato will reject and we report it */
    }
  }

  const results: Array<{ platform: string; ok: boolean; error?: string }> = [];
  for (const platform of body.platforms) {
    const accountId = byPlatform.get(platform);
    if (!accountId) {
      results.push({ platform, ok: false, error: "not connected in Blotato" });
      continue;
    }
    const res = await fetch("https://backend.blotato.com/v2/posts", {
      method: "POST",
      headers: { "blotato-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        post: {
          accountId,
          content: { text: body.caption, mediaUrls: [body.mediaUrl], platform },
          target: target(platform, body.title || body.caption.split("\n")[0], pageId),
        },
        scheduledTime: body.when,
      }),
    });
    if (res.ok) {
      results.push({ platform, ok: true });
    } else {
      const t = await res.text();
      let msg = t.slice(0, 160);
      try {
        msg = (JSON.parse(t) as { message?: string }).message ?? msg;
      } catch {
        /* keep raw */
      }
      results.push({ platform, ok: false, error: msg });
    }
    // Blotato allows 30 requests/minute; stay well inside it.
    await new Promise((r) => setTimeout(r, 2100));
  }

  return NextResponse.json({ results });
}
