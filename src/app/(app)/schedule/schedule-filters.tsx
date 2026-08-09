"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import {
  PLATFORM_COLOR,
  PLATFORM_LABEL,
  videoKey,
  type Platform,
  type ScheduledPost,
} from "@/lib/blotato";
import { DayGroup, dayKey } from "@/components/queue-ui";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

const PLATFORMS: Platform[] = ["instagram", "youtube", "tiktok", "facebook", "linkedin"];

/**
 * Client-side filtering over the queue.
 *
 * ~200 posts is small enough to filter in the browser, which keeps it instant
 * and avoids a round-trip per keystroke. Counts are computed from the full set
 * so a chip always shows how much it would give you, even at zero.
 */
export function ScheduleFilters({ posts }: { posts: ScheduledPost[] }) {
  const [platform, setPlatform] = useState<Platform | "all">("all");
  const [query, setQuery] = useState("");
  const [month, setMonth] = useState<string>("all");

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of posts) m.set(p.platform, (m.get(p.platform) ?? 0) + 1);
    return m;
  }, [posts]);

  const months = useMemo(() => {
    const seen = new Map<string, string>();
    for (const p of posts) {
      const d = new Date(p.scheduledAt);
      const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
      if (!seen.has(key)) {
        seen.set(
          key,
          new Intl.DateTimeFormat("en-GB", {
            month: "long", year: "numeric", timeZone: "Europe/London",
          }).format(d)
        );
      }
    }
    return [...seen.entries()].sort();
  }, [posts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return posts.filter((p) => {
      if (platform !== "all" && p.platform !== platform) return false;
      if (month !== "all" && !p.scheduledAt.startsWith(month)) return false;
      if (q && !p.text.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [posts, platform, query, month]);

  const groups = useMemo(() => {
    const m = new Map<string, ScheduledPost[]>();
    for (const p of filtered) {
      const k = dayKey(p.scheduledAt);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    return [...m.entries()];
  }, [filtered]);

  const videoCount = new Set(filtered.map(videoKey)).size;
  const isFiltered = platform !== "all" || month !== "all" || query.trim() !== "";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Chip active={platform === "all"} onClick={() => setPlatform("all")} label="All" count={posts.length} />
        {PLATFORMS.filter((p) => counts.get(p)).map((p) => (
          <Chip
            key={p}
            active={platform === p}
            onClick={() => setPlatform(p)}
            label={PLATFORM_LABEL[p]}
            count={counts.get(p) ?? 0}
            dot={PLATFORM_COLOR[p]}
          />
        ))}

        <div className="relative ml-auto flex items-center">
          <Search className="size-3.5 text-muted-foreground absolute left-2.5 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search captions"
            aria-label="Search captions"
            className="h-8 w-44 sm:w-56 rounded-md border border-border bg-surface pl-8 pr-7 text-xs outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:border-brand/50"
          />
          {query ? (
            <button
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>

        {months.length > 1 ? (
          <select
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            aria-label="Filter by month"
            className="h-8 rounded-md border border-border bg-surface px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            <option value="all">All months</option>
            {months.map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>
        ) : null}
      </div>

      <p className="text-sm text-muted-foreground tabular-nums">
        <span className="text-foreground font-medium">{videoCount}</span> videos ·{" "}
        <span className="text-foreground font-medium">{filtered.length}</span> posts ·{" "}
        <span className="text-foreground font-medium">{groups.length}</span> posting days
        {isFiltered ? (
          <button
            onClick={() => { setPlatform("all"); setQuery(""); setMonth("all"); }}
            className="ml-2 text-brand hover:underline"
          >
            Clear filters
          </button>
        ) : null}
      </p>

      {groups.length === 0 ? (
        <Card className="px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">Nothing matches those filters.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          {groups.map(([date, dayPosts]) => (
            <DayGroup key={date} date={date} posts={dayPosts} />
          ))}
        </Card>
      )}
    </div>
  );
}

function Chip({
  active, onClick, label, count, dot,
}: { active: boolean; onClick: () => void; label: string; count: number; dot?: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "h-8 px-2.5 rounded-full text-xs font-medium border transition-colors inline-flex items-center gap-1.5",
        active
          ? "bg-surface-2 text-foreground border-border-strong"
          : "border-border text-muted-foreground hover:text-foreground hover:bg-surface-2/60"
      )}
    >
      {dot ? <span className="size-1.5 rounded-full" style={{ background: dot }} aria-hidden /> : null}
      {label}
      <span className="tabular-nums opacity-60">{count}</span>
    </button>
  );
}
