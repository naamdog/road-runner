"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  List,
  Loader2,
  RotateCw,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlatformIcon } from "@/components/platform-icon";
import {
  PLATFORM_META,
  POST_STATUS_LABEL,
  type Platform,
  type PostStatus,
} from "@/lib/platforms";
import { cn } from "@/lib/utils";

interface Row {
  id: string;
  platform: Platform;
  status: PostStatus;
  scheduledAt: string;
  publishedAt: string | null;
  publishedUrl: string | null;
  caption: string;
  postId: string;
  lastError: string | null;
  attempts: number;
  thumbnailUrl: string | null;
}

export function ScheduledView({ rows }: { rows: Row[] }) {
  const router = useRouter();
  const [view, setView] = useState<"list" | "calendar">("list");
  const [filter, setFilter] = useState<PostStatus | "all">("all");
  const [pending, setPending] = useState<string | null>(null);

  const filtered = useMemo(() => {
    return rows.filter((r) => (filter === "all" ? true : r.status === filter));
  }, [rows, filter]);

  async function cancel(id: string) {
    setPending(id);
    try {
      const res = await fetch(`/api/posts/targets/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not cancel");
      toast.success("Canceled.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not cancel.");
    } finally {
      setPending(null);
    }
  }

  async function retry(id: string) {
    setPending(id);
    try {
      const res = await fetch(`/api/posts/targets/${id}/retry`, { method: "POST" });
      if (!res.ok) throw new Error("Could not retry");
      toast.success("Queued for retry.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not retry.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <Tabs value={view} onValueChange={(v) => setView(v as "list" | "calendar")}>
          <TabsList>
            <TabsTrigger value="list" className="gap-1.5">
              <List className="size-3.5" />
              List
            </TabsTrigger>
            <TabsTrigger value="calendar" className="gap-1.5">
              <CalendarDays className="size-3.5" />
              Calendar
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <StatusFilter value={filter} onChange={setFilter} />
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <CalendarDays className="size-8 mx-auto text-muted-foreground" />
          <h3 className="mt-3 text-sm font-semibold">Nothing here yet</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Schedule your first short to see it on this page.
          </p>
        </Card>
      ) : view === "list" ? (
        <ListView
          rows={filtered}
          onCancel={cancel}
          onRetry={retry}
          pending={pending}
        />
      ) : (
        <CalendarView rows={filtered} onCancel={cancel} />
      )}
    </div>
  );
}

function StatusFilter({
  value,
  onChange,
}: {
  value: PostStatus | "all";
  onChange: (v: PostStatus | "all") => void;
}) {
  const opts: { id: PostStatus | "all"; label: string }[] = [
    { id: "all", label: "All" },
    { id: "scheduled", label: "Scheduled" },
    { id: "publishing", label: "Publishing" },
    { id: "published", label: "Published" },
    { id: "failed", label: "Failed" },
    { id: "canceled", label: "Canceled" },
  ];
  return (
    <div className="flex items-center gap-2">
      <Filter className="size-3.5 text-muted-foreground" />
      <div className="flex items-center gap-1 overflow-x-auto">
        {opts.map((o) => (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            className={cn(
              "h-7 px-2.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap",
              value === o.id
                ? "bg-surface-2 text-foreground border border-border"
                : "text-muted-foreground hover:text-foreground border border-transparent"
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ListView({
  rows,
  onCancel,
  onRetry,
  pending,
}: {
  rows: Row[];
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  pending: string | null;
}) {
  // Group by day
  const grouped = useMemo(() => {
    const g = new Map<string, Row[]>();
    for (const r of rows) {
      const d = new Date(r.scheduledAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(r);
    }
    return g;
  }, [rows]);

  return (
    <div className="space-y-6">
      {[...grouped.entries()].map(([key, items]) => (
        <div key={key}>
          <div className="text-xs uppercase tracking-wider text-subtle-foreground mb-2 px-1">
            {formatDay(items[0].scheduledAt)}
          </div>
          <Card className="p-0 overflow-hidden">
            <ul className="divide-y divide-border">
              {items.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center gap-3 px-5 py-3.5"
                >
                  <PlatformIcon platform={r.platform} size={22} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">
                      {r.caption || (
                        <span className="text-subtle-foreground italic">
                          (no caption)
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
                      <span>{PLATFORM_META[r.platform].name}</span>
                      <span>·</span>
                      <StatusBadge status={r.status} />
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
                  <div className="text-right shrink-0">
                    <div className="text-sm font-medium tabular-nums">
                      {formatTime(r.scheduledAt)}
                    </div>
                  </div>
                  <RowActions
                    row={r}
                    onCancel={onCancel}
                    onRetry={onRetry}
                    pending={pending === r.id}
                  />
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ))}
    </div>
  );
}

function RowActions({
  row,
  onCancel,
  onRetry,
  pending,
}: {
  row: Row;
  onCancel: (id: string) => void;
  onRetry: (id: string) => void;
  pending: boolean;
}) {
  if (row.status === "published" && row.publishedUrl) {
    return (
      <a
        href={row.publishedUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-brand hover:underline px-2 py-1"
      >
        View ↗
      </a>
    );
  }
  if (row.status === "failed") {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => onRetry(row.id)}
      >
        {pending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <RotateCw className="size-3" />
        )}
        Retry
      </Button>
    );
  }
  if (row.status === "scheduled") {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={pending}
        onClick={() => onCancel(row.id)}
        title="Cancel"
      >
        {pending ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <X className="size-3" />
        )}
      </Button>
    );
  }
  return null;
}

function StatusBadge({ status }: { status: PostStatus }) {
  const variant = {
    scheduled: "default",
    publishing: "warning",
    published: "success",
    failed: "destructive",
    canceled: "muted",
    draft: "muted",
  }[status] as React.ComponentProps<typeof Badge>["variant"];

  const Icon = {
    scheduled: Clock,
    publishing: Loader2,
    published: CheckCircle2,
    failed: AlertCircle,
    canceled: X,
    draft: Clock,
  }[status];

  return (
    <Badge variant={variant} className="gap-1">
      <Icon
        className={cn(
          "size-3",
          status === "publishing" && "animate-spin"
        )}
      />
      <span>{POST_STATUS_LABEL[status]}</span>
    </Badge>
  );
}

function CalendarView({ rows, onCancel }: { rows: Row[]; onCancel: (id: string) => void }) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });

  const grouped = useMemo(() => {
    const g = new Map<string, Row[]>();
    for (const r of rows) {
      const d = new Date(r.scheduledAt);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!g.has(key)) g.set(key, []);
      g.get(key)!.push(r);
    }
    return g;
  }, [rows]);

  const monthName = cursor.toLocaleDateString("en", {
    month: "long",
    year: "numeric",
  });

  const firstDay = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const startDow = (firstDay.getDay() + 6) % 7; // Monday-start
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();

  const cells: Array<{ date: Date; rows: Row[]; outside: boolean } | null> = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(cursor.getFullYear(), cursor.getMonth(), day);
    const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
    cells.push({ date: d, rows: grouped.get(key) ?? [], outside: false });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-base font-semibold">{monthName}</h3>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() =>
              setCursor(
                new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1)
              )
            }
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              const d = new Date();
              d.setDate(1);
              setCursor(d);
            }}
          >
            <span className="text-[10px] uppercase tracking-wider">Today</span>
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() =>
              setCursor(
                new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
              )
            }
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-px text-xs text-subtle-foreground border-b border-border pb-2 mb-2">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="px-2 uppercase tracking-wider">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1.5">
        {cells.map((c, i) => {
          if (!c) return <div key={i} className="min-h-24" />;
          const isToday = isSameDay(c.date, new Date());
          return (
            <div
              key={i}
              className={cn(
                "min-h-24 rounded-md border border-border bg-surface/50 p-1.5 flex flex-col gap-1",
                isToday && "border-brand/40 bg-brand/[0.04]"
              )}
            >
              <div
                className={cn(
                  "text-[11px] font-mono tabular-nums",
                  isToday ? "text-brand" : "text-muted-foreground"
                )}
              >
                {c.date.getDate()}
              </div>
              {c.rows.slice(0, 3).map((r) => (
                <div
                  key={r.id}
                  className={cn(
                    "rounded px-1.5 py-1 text-[10px] flex items-center gap-1 truncate",
                    r.status === "published"
                      ? "bg-success/15 text-success"
                      : r.status === "failed"
                      ? "bg-destructive/15 text-destructive"
                      : "bg-surface-2 text-foreground"
                  )}
                  title={`${PLATFORM_META[r.platform].shortName} · ${formatTime(
                    r.scheduledAt
                  )}`}
                >
                  <PlatformIcon platform={r.platform} size={10} />
                  <span className="tabular-nums">{formatShortTime(r.scheduledAt)}</span>
                </div>
              ))}
              {c.rows.length > 3 ? (
                <div className="text-[10px] text-subtle-foreground px-1">
                  +{c.rows.length - 3} more
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDay(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  if (isSameDay(d, today)) return "Today";
  if (isSameDay(d, tomorrow)) return "Tomorrow";
  return d.toLocaleDateString("en", {
    weekday: "long",
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

function formatShortTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en", {
    hour: "numeric",
    minute: "2-digit",
  });
}
