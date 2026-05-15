"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Download,
  ExternalLink,
  Eye,
  Heart,
  Loader2,
  MessageCircle,
  Repeat,
  Share2,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/platform-icon";
import { PLATFORM_META, PLATFORMS, type Platform } from "@/lib/platforms";
import type { PopularVideo } from "@/lib/rerunner";
import { cn } from "@/lib/utils";

export function ReRunnerGrid({ videos }: { videos: PopularVideo[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<Platform | "all">("all");
  const [autoOnly, setAutoOnly] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState<string | null>(null);
  const [bulkPending, setBulkPending] = useState(false);

  const filtered = useMemo(() => {
    return videos.filter((v) => {
      if (filter !== "all" && v.platform !== filter) return false;
      if (autoOnly && !v.canAutoDownload) return false;
      return true;
    });
  }, [videos, filter, autoOnly]);

  const platformCounts = useMemo(() => {
    const m = new Map<Platform, number>();
    for (const v of videos) {
      m.set(v.platform, (m.get(v.platform) ?? 0) + 1);
    }
    return m;
  }, [videos]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function rerunOne(v: PopularVideo) {
    setPending(v.id);
    try {
      const res = await fetch("/api/re-runner/rerun", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sourcePlatform: v.platform,
          sourceExternalId: v.externalId,
          videoUrl: v.videoUrl,
          thumbnailUrl: v.thumbnailUrl,
          caption: v.caption,
          durationSec: v.durationSec,
        }),
      });
      const j = await res.json();
      if (!res.ok) {
        throw new Error(j.error || "Re-run failed");
      }
      if (j.requiresManualUpload) {
        const q = new URLSearchParams({
          caption: v.caption,
          source: v.platform,
          permalink: v.permalinkUrl,
        });
        toast.info("Caption pre-filled — pick the video file to re-upload.");
        router.push(`/compose?${q.toString()}`);
        return;
      }
      const q = new URLSearchParams({
        media: j.mediaId,
        caption: j.caption ?? v.caption,
        source: v.platform,
      });
      toast.success("Pulled & ready — pick your platforms and times.");
      router.push(`/compose?${q.toString()}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Re-run failed.");
    } finally {
      setPending(null);
    }
  }

  async function rerunSelected() {
    if (selected.size === 0) return;
    const items = videos.filter((v) => selected.has(v.id));
    setBulkPending(true);
    try {
      const results = await Promise.allSettled(
        items.map((v) =>
          fetch("/api/re-runner/rerun", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              sourcePlatform: v.platform,
              sourceExternalId: v.externalId,
              videoUrl: v.videoUrl,
              thumbnailUrl: v.thumbnailUrl,
              caption: v.caption,
              durationSec: v.durationSec,
            }),
          }).then(async (r) => {
            const j = await r.json();
            if (!r.ok) throw new Error(j.error || "failed");
            return { v, j };
          })
        )
      );
      const succeeded = results.filter((r) => r.status === "fulfilled").length;
      const failed = results.filter((r) => r.status === "rejected").length;
      const manualOnly = results
        .filter(
          (r): r is PromiseFulfilledResult<{ v: PopularVideo; j: { requiresManualUpload?: boolean } }> =>
            r.status === "fulfilled"
        )
        .filter((r) => r.value.j.requiresManualUpload).length;

      if (succeeded > 0) {
        toast.success(
          `Pulled ${succeeded - manualOnly}/${items.length} into your library. ${
            manualOnly ? `${manualOnly} need manual upload.` : ""
          }`
        );
      }
      if (failed > 0) {
        toast.error(`${failed} re-runs failed.`);
      }
      setSelected(new Set());
      router.push("/scheduled");
    } finally {
      setBulkPending(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <PlatformFilter
          value={filter}
          onChange={setFilter}
          counts={platformCounts}
        />
        <button
          onClick={() => setAutoOnly((v) => !v)}
          className={cn(
            "h-7 px-2.5 rounded-full text-xs font-medium transition-colors inline-flex items-center gap-1.5 border",
            autoOnly
              ? "bg-brand/10 text-brand border-brand/40"
              : "border-border text-muted-foreground hover:text-foreground"
          )}
        >
          <Zap className="size-3" />
          Auto-download only
        </button>
        {selected.size > 0 ? (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {selected.size} selected
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelected(new Set())}
            >
              Clear
            </Button>
            <Button
              variant="brand"
              size="sm"
              onClick={rerunSelected}
              disabled={bulkPending}
              className="gap-1.5"
            >
              {bulkPending ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Repeat className="size-3.5" />
              )}
              Re-run {selected.size}
            </Button>
          </div>
        ) : null}
      </div>

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          No videos match the current filter.
        </Card>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {filtered.map((v) => (
            <VideoCard
              key={v.id}
              video={v}
              selected={selected.has(v.id)}
              onToggle={() => toggleSelect(v.id)}
              onRerun={() => rerunOne(v)}
              pending={pending === v.id || bulkPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PlatformFilter({
  value,
  onChange,
  counts,
}: {
  value: Platform | "all";
  onChange: (v: Platform | "all") => void;
  counts: Map<Platform, number>;
}) {
  const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
  return (
    <div className="flex items-center gap-1 flex-wrap">
      <button
        onClick={() => onChange("all")}
        className={cn(
          "h-7 px-2.5 rounded-full text-xs font-medium transition-colors inline-flex items-center gap-1.5 border",
          value === "all"
            ? "bg-surface-2 text-foreground border-border"
            : "border-transparent text-muted-foreground hover:text-foreground"
        )}
      >
        All
        <span className="text-subtle-foreground tabular-nums">{total}</span>
      </button>
      {PLATFORMS.map((p) => {
        const c = counts.get(p) ?? 0;
        if (c === 0) return null;
        return (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={cn(
              "h-7 px-2.5 rounded-full text-xs font-medium transition-colors inline-flex items-center gap-1.5 border",
              value === p
                ? "bg-surface-2 text-foreground border-border"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <PlatformIcon platform={p} size={12} />
            {PLATFORM_META[p].shortName}
            <span className="text-subtle-foreground tabular-nums">{c}</span>
          </button>
        );
      })}
    </div>
  );
}

function VideoCard({
  video,
  selected,
  onToggle,
  onRerun,
  pending,
}: {
  video: PopularVideo;
  selected: boolean;
  onToggle: () => void;
  onRerun: () => void;
  pending: boolean;
}) {
  return (
    <Card
      className={cn(
        "p-0 overflow-hidden transition-colors group relative",
        selected ? "border-brand" : "hover:border-border-strong"
      )}
    >
      {/* Select checkbox */}
      <button
        onClick={onToggle}
        aria-label={selected ? "Deselect" : "Select"}
        className={cn(
          "absolute top-2 left-2 z-10 size-6 rounded-md border flex items-center justify-center transition-all",
          selected
            ? "bg-brand border-brand text-brand-foreground opacity-100"
            : "bg-black/60 backdrop-blur border-border opacity-0 group-hover:opacity-100"
        )}
      >
        {selected ? <Check className="size-3.5 stroke-[3]" /> : null}
      </button>

      <a
        href={video.permalinkUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block aspect-[9/16] bg-surface-3 relative"
      >
        {video.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnailUrl}
            alt=""
            className="size-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="size-full flex items-center justify-center bg-gradient-to-br from-surface-3 to-surface-2">
            <PlatformIcon platform={video.platform} size={36} />
          </div>
        )}
        <div className="absolute inset-x-0 top-0 p-2 bg-gradient-to-b from-black/70 to-transparent flex items-start justify-between gap-2">
          <PlatformIcon platform={video.platform} size={18} />
          {video.canAutoDownload ? (
            <span className="rounded-full bg-brand/90 text-brand-foreground px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider inline-flex items-center gap-0.5">
              <Zap className="size-2.5" />
              Auto
            </span>
          ) : (
            <span className="rounded-full bg-black/70 backdrop-blur text-foreground px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider">
              Manual
            </span>
          )}
        </div>
        <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/85 to-transparent flex items-end justify-between text-[10px] text-foreground/95 font-medium">
          <div className="flex gap-2 flex-wrap">
            {video.views !== null ? (
              <span className="inline-flex items-center gap-0.5 tabular-nums">
                <Eye className="size-3" />
                {formatCount(video.views)}
              </span>
            ) : null}
            {video.likes !== null ? (
              <span className="inline-flex items-center gap-0.5 tabular-nums">
                <Heart className="size-3" />
                {formatCount(video.likes)}
              </span>
            ) : null}
            {video.comments !== null ? (
              <span className="inline-flex items-center gap-0.5 tabular-nums">
                <MessageCircle className="size-3" />
                {formatCount(video.comments)}
              </span>
            ) : null}
            {video.shares !== null ? (
              <span className="inline-flex items-center gap-0.5 tabular-nums">
                <Share2 className="size-3" />
                {formatCount(video.shares)}
              </span>
            ) : null}
          </div>
        </div>
      </a>

      <div className="p-3 space-y-2">
        <div className="text-xs line-clamp-2 leading-tight min-h-[2.25rem] text-foreground/90">
          {video.caption || (
            <span className="text-subtle-foreground italic">No caption</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            onClick={onRerun}
            disabled={pending}
            size="sm"
            variant="brand"
            className="flex-1 gap-1.5"
          >
            {pending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : video.canAutoDownload ? (
              <Download className="size-3.5" />
            ) : (
              <Repeat className="size-3.5" />
            )}
            {video.canAutoDownload ? "Pull & re-run" : "Re-run manually"}
          </Button>
          <a
            href={video.permalinkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="size-8 inline-flex items-center justify-center rounded-md border border-border hover:bg-surface-2 transition-colors"
            title="Open original"
          >
            <ExternalLink className="size-3.5 text-muted-foreground" />
          </a>
        </div>
      </div>
    </Card>
  );
}

function formatCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  if (n < 1_000_000) return Math.round(n / 1000) + "K";
  if (n < 10_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  return Math.round(n / 1_000_000) + "M";
}
