"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Globe,
  Lock,
  Loader2,
  RotateCw,
  Tv,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { PostStatus } from "@/lib/platforms";

export interface TubeRow {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  visibility: "public" | "unlisted" | "private";
  status: PostStatus;
  scheduledAt: string;
  publishedAt: string | null;
  publishedUrl: string | null;
  lastError: string | null;
}

export function TubeList({ rows }: { rows: TubeRow[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | PostStatus>("all");
  const [pending, setPending] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => r.status === filter);
  }, [rows, filter]);

  async function cancel(id: string) {
    setPending(id);
    try {
      const res = await fetch(`/api/tube/posts/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not cancel");
      toast.success("Canceled.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel");
    } finally {
      setPending(null);
    }
  }

  async function retry(id: string) {
    setPending(id);
    try {
      const res = await fetch(`/api/tube/posts/${id}/retry`, { method: "POST" });
      if (!res.ok) throw new Error("Could not retry");
      toast.success("Queued for another try.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not retry");
    } finally {
      setPending(null);
    }
  }

  if (rows.length === 0) {
    return (
      <Card className="p-10 text-center">
        <Tv className="size-7 mx-auto text-muted-foreground" />
        <h3 className="mt-3 text-sm font-semibold">No long videos yet</h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
          Upload your first long-form video. Add a title, a thumbnail, pick a
          time, done.
        </p>
      </Card>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-3 flex-wrap">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as never)}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="scheduled">Lined up</TabsTrigger>
            <TabsTrigger value="published">Posted</TabsTrigger>
            <TabsTrigger value="failed">Failed</TabsTrigger>
          </TabsList>
        </Tabs>
        <span className="text-xs text-muted-foreground tabular-nums">
          {filtered.length} {filtered.length === 1 ? "video" : "videos"}
        </span>
      </div>

      <Card className="p-0 overflow-hidden">
        <ul className="divide-y divide-border">
          {filtered.map((r) => (
            <li
              key={r.id}
              className="flex items-start gap-4 p-4"
            >
              <div className="size-20 sm:w-32 sm:h-[72px] shrink-0 rounded-md overflow-hidden bg-surface-3 relative">
                {r.thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={r.thumbnailUrl}
                    alt=""
                    className="size-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="size-full flex items-center justify-center">
                    <Tv className="size-5 text-muted-foreground" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-semibold truncate">{r.title}</h3>
                  <VisibilityBadge v={r.visibility} />
                </div>
                {r.description ? (
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                    {r.description}
                  </p>
                ) : null}
                <div className="flex items-center gap-2 mt-2 flex-wrap text-xs text-muted-foreground">
                  <StatusBadge status={r.status} />
                  <span>·</span>
                  <span className="tabular-nums">
                    {r.status === "published" && r.publishedAt
                      ? `posted ${formatDate(r.publishedAt)}`
                      : `${formatDate(r.scheduledAt)} at ${formatTime(r.scheduledAt)}`}
                  </span>
                  {r.lastError && r.status === "failed" ? (
                    <>
                      <span>·</span>
                      <span className="text-destructive truncate max-w-[300px]">
                        {r.lastError}
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
              <div className="shrink-0">
                {r.status === "published" && r.publishedUrl ? (
                  <a
                    href={r.publishedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-brand hover:underline px-2 py-1"
                  >
                    Watch ↗
                  </a>
                ) : r.status === "failed" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => retry(r.id)}
                    disabled={pending === r.id}
                  >
                    {pending === r.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <RotateCw className="size-3" />
                    )}
                    Retry
                  </Button>
                ) : r.status === "scheduled" ? (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => cancel(r.id)}
                    disabled={pending === r.id}
                    title="Cancel"
                  >
                    {pending === r.id ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <X className="size-3" />
                    )}
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

function VisibilityBadge({ v }: { v: TubeRow["visibility"] }) {
  if (v === "public") {
    return (
      <Badge variant="muted" className="gap-1">
        <Globe className="size-2.5" /> Public
      </Badge>
    );
  }
  if (v === "unlisted") {
    return (
      <Badge variant="muted" className="gap-1">
        <EyeOff className="size-2.5" /> Unlisted
      </Badge>
    );
  }
  return (
    <Badge variant="muted" className="gap-1">
      <Lock className="size-2.5" /> Private
    </Badge>
  );
}

function StatusBadge({ status }: { status: PostStatus }) {
  const map = {
    scheduled: { variant: "default" as const, Icon: Clock, label: "Lined up" },
    publishing: { variant: "warning" as const, Icon: Loader2, label: "Uploading" },
    published: { variant: "success" as const, Icon: CheckCircle2, label: "Posted" },
    failed: { variant: "destructive" as const, Icon: AlertCircle, label: "Failed" },
    canceled: { variant: "muted" as const, Icon: X, label: "Canceled" },
    draft: { variant: "muted" as const, Icon: Clock, label: "Draft" },
  };
  const m = map[status];
  return (
    <Badge variant={m.variant} className="gap-1">
      <m.Icon className={cn("size-3", status === "publishing" && "animate-spin")} />
      {m.label}
    </Badge>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (sameDay(d, today)) return "today";
  if (sameDay(d, tomorrow)) return "tomorrow";
  return d.toLocaleDateString("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en", {
    hour: "numeric",
    minute: "2-digit",
  });
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
