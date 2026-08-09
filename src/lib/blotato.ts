import "server-only";

/**
 * Blotato is the source of truth for everything Road Runner shows.
 *
 * Road Runner no longer stores posts, connections or tokens of its own — Blotato
 * holds the platform connections and does the publishing, and this app is the
 * window onto it. That means no database, no cron, and no OAuth to maintain.
 */

const BASE = "https://backend.blotato.com/v2";

/** Starter plan ceiling. The queue is capped, so the app surfaces it prominently. */
export const SCHEDULE_LIMIT = 200;

export type Platform = "facebook" | "instagram" | "tiktok" | "youtube" | "linkedin";

export interface Account {
  id: string;
  platform: Platform;
  username: string;
  fullname: string;
}

export interface ScheduledPost {
  id: string;
  scheduledAt: string;
  platform: Platform;
  text: string;
  mediaUrl: string | null;
  accountLabel: string;
  avatarUrl: string | null;
}

export interface QueuePost {
  id: string;
  platform: Platform;
  text: string;
  mediaUrl: string | null;
  postTime: string | null;
  state: "scheduled" | "failed" | "published" | string;
  error: string | null;
}

function key(): string {
  const k = process.env.BLOTATO_API_KEY;
  if (!k) throw new Error("BLOTATO_API_KEY is not set");
  return k;
}

async function api<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "blotato-api-key": key(), "Content-Type": "application/json" },
    // Always read live — a stale queue is worse than a slightly slower page.
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Blotato ${path} -> ${res.status}`);
  return (await res.json()) as T;
}

export async function getAccounts(): Promise<Account[]> {
  const d = await api<{ items: Account[] }>("/users/me/accounts");
  return d.items ?? [];
}

/** Every scheduled post, following the cursor until the queue is exhausted. */
export async function getSchedule(): Promise<ScheduledPost[]> {
  const out: ScheduledPost[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < 12; page++) {
    const d = await api<{
      items: Array<{
        id: string;
        scheduledAt: string;
        account?: { name?: string; subaccountName?: string; username?: string; profileImageUrl?: string };
        draft?: { content?: { text?: string; platform?: Platform; mediaUrls?: string[] } };
      }>;
      cursor?: string;
      nextCursor?: string;
    }>(`/schedules?limit=100${cursor ? `&cursor=${cursor}` : ""}`);

    for (const it of d.items ?? []) {
      const c = it.draft?.content;
      out.push({
        id: it.id,
        scheduledAt: it.scheduledAt,
        platform: (c?.platform ?? "facebook") as Platform,
        text: c?.text ?? "",
        mediaUrl: c?.mediaUrls?.[0] ?? null,
        accountLabel:
          it.account?.subaccountName ||
          it.account?.username ||
          it.account?.name ||
          "",
        avatarUrl: it.account?.profileImageUrl ?? null,
      });
    }
    cursor = d.cursor ?? d.nextCursor;
    if (!cursor || !(d.items ?? []).length) break;
  }
  return out.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
}

/**
 * The processing queue — this is where failures surface. Blotato accepts a post
 * and fetches its video afterwards, so "created" is not "will publish": a bad
 * media URL turns up here as `failed` later. Road Runner shows these loudly.
 */
export async function getQueue(): Promise<QueuePost[]> {
  const d = await api<{
    items: Array<{
      id: string;
      platform: Platform;
      text?: string;
      mediaUrls?: string[];
      postTime?: string;
      state?: { type?: string; errorMessage?: string };
    }>;
  }>("/posts?limit=200");

  return (d.items ?? []).map((i) => ({
    id: i.id,
    platform: i.platform,
    text: i.text ?? "",
    mediaUrl: i.mediaUrls?.[0] ?? null,
    postTime: i.postTime ?? null,
    state: i.state?.type ?? "unknown",
    error: i.state?.errorMessage ?? null,
  }));
}

export interface Overview {
  accounts: Account[];
  schedule: ScheduledPost[];
  failed: QueuePost[];
  /** Distinct videos in the queue (one video fans out to several platforms). */
  videoCount: number;
  nextUp: ScheduledPost[];
  quotaUsed: number;
  quotaPct: number;
  lastDate: string | null;
  error: string | null;
}

/** One call for the whole dashboard, degrading gracefully if Blotato is down. */
export async function getOverview(): Promise<Overview> {
  try {
    const [accounts, schedule, queue] = await Promise.all([
      getAccounts(),
      getSchedule(),
      getQueue(),
    ]);
    const now = Date.now();
    const nextUp = schedule.filter((s) => new Date(s.scheduledAt).getTime() >= now);
    return {
      accounts,
      schedule,
      failed: queue.filter((q) => q.state === "failed"),
      videoCount: new Set(schedule.map((s) => s.mediaUrl ?? s.text)).size,
      nextUp: nextUp.slice(0, 8),
      quotaUsed: schedule.length,
      quotaPct: Math.round((schedule.length / SCHEDULE_LIMIT) * 100),
      lastDate: schedule.length ? schedule[schedule.length - 1].scheduledAt : null,
      error: null,
    };
  } catch (e) {
    return {
      accounts: [], schedule: [], failed: [], videoCount: 0, nextUp: [],
      quotaUsed: 0, quotaPct: 0, lastDate: null,
      error: e instanceof Error ? e.message : "Could not reach Blotato",
    };
  }
}

export const PLATFORM_LABEL: Record<Platform, string> = {
  facebook: "Facebook", instagram: "Instagram", tiktok: "TikTok",
  youtube: "YouTube", linkedin: "LinkedIn",
};

export const PLATFORM_COLOR: Record<Platform, string> = {
  facebook: "#1877F2", instagram: "#E1306C", tiktok: "#FF0050",
  youtube: "#FF0033", linkedin: "#0A66C2",
};
