import Link from "next/link";
import { AlertTriangle, ArrowUpRight } from "lucide-react";
import { PLATFORM_COLOR, PLATFORM_LABEL, videoKey, type Platform, type ScheduledPost } from "@/lib/blotato-shared";
import { cn } from "@/lib/utils";
import { VideoThumb } from "@/components/video-thumb";

const LONDON = "Europe/London";

export function fmtDay(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "numeric", month: "short", timeZone: LONDON,
  }).format(new Date(iso));
}
export function fmtTime(iso: string) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", timeZone: LONDON,
  }).format(new Date(iso));
}
export function dayKey(iso: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: LONDON }).format(new Date(iso));
}

/** A small platform dot + name, coloured by the platform's own brand. */
export function PlatformChip({ platform, size = "sm" }: { platform: Platform; size?: "sm" | "xs" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 font-medium text-foreground whitespace-nowrap",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-1.5 py-0.5 text-[10px]"
      )}
    >
      <span
        className="size-1.5 rounded-full shrink-0"
        style={{ background: PLATFORM_COLOR[platform] ?? "#888" }}
        aria-hidden
      />
      {PLATFORM_LABEL[platform] ?? platform}
    </span>
  );
}

/**
 * Video preview slot — a real poster frame that opens a player on click.
 * See `VideoThumb`: the bytes come through /api/media, which re-labels them as
 * video/mp4 and forwards Range so a frame costs a few KB instead of the file.
 */
export function Thumb({
  url, className, caption,
}: { url: string | null; className?: string; caption?: string; eager?: boolean }) {
  return <VideoThumb url={url} className={className} caption={caption} />;
}

/**
 * One dated group of posts. A single video fans out to several platforms at the
 * same minute, so they're grouped by video rather than listed four times.
 */
export function DayGroup({
  date, posts, eager = false,
}: { date: string; posts: ScheduledPost[]; eager?: boolean }) {
  const byVideo = new Map<string, ScheduledPost[]>();
  for (const p of posts) {
    const k = videoKey(p);
    if (!byVideo.has(k)) byVideo.set(k, []);
    byVideo.get(k)!.push(p);
  }

  return (
    <div className="border-b border-border last:border-b-0">
      <div className="px-5 py-2.5 bg-surface-2/50 sticky top-0 backdrop-blur-sm z-10 flex items-baseline gap-3">
        <span className="text-sm font-semibold">{fmtDay(date)}</span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {byVideo.size} video{byVideo.size === 1 ? "" : "s"} · {posts.length} post{posts.length === 1 ? "" : "s"}
        </span>
      </div>
      <ul className="divide-y divide-border">
        {[...byVideo.values()].map((group) => {
          const first = group[0];
          return (
            <li key={first.id} className="flex gap-4 px-5 py-4">
              <Thumb url={first.mediaUrl} caption={first.text} className="w-16 h-28 rounded-md shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground line-clamp-3 leading-relaxed">{first.text}</p>
                <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
                  <span className="text-xs text-muted-foreground tabular-nums mr-1">
                    {fmtTime(first.scheduledAt)}
                  </span>
                  {group
                    .sort((a, b) => a.platform.localeCompare(b.platform))
                    .map((g) => (
                      <PlatformChip key={g.id} platform={g.platform} size="xs" />
                    ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Loud, actionable banner — failures are the thing you must not miss. */
export function FailureBanner({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <Link
      href="/failed"
      className="flex items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 transition-colors hover:bg-destructive/15"
    >
      <AlertTriangle className="size-5 text-destructive shrink-0" />
      <div className="flex-1 text-sm">
        <span className="font-medium text-foreground">
          {count} post{count === 1 ? "" : "s"} failed to publish.
        </span>{" "}
        <span className="text-muted-foreground">
          Blotato accepted them but couldn&apos;t process the video — they will not go out.
        </span>
      </div>
      <ArrowUpRight className="size-4 text-muted-foreground shrink-0" />
    </Link>
  );
}
