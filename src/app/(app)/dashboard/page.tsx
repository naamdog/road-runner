import Link from "next/link";
import type { Metadata } from "next";
import { CalendarDays, Film, Link2, Layers, ArrowUpRight, CircleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getOverview, SCHEDULE_LIMIT, PLATFORM_COLOR, PLATFORM_LABEL } from "@/lib/blotato";
import { DayGroup, FailureBanner, dayKey, fmtDay } from "@/components/queue-ui";
import type { ScheduledPost } from "@/lib/blotato";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const o = await getOverview();

  if (o.error) {
    return (
      <div className="container-page py-8 max-w-6xl">
        <Card className="p-6 border-destructive/40 bg-destructive/5">
          <div className="flex items-start gap-3">
            <CircleAlert className="size-5 text-destructive shrink-0 mt-0.5" />
            <div>
              <h2 className="font-semibold">Can&apos;t reach Blotato</h2>
              <p className="text-sm text-muted-foreground mt-1">{o.error}</p>
              <p className="text-sm text-muted-foreground mt-2">
                Check <code className="text-foreground">BLOTATO_API_KEY</code> is set and valid.
              </p>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  // Group the next fortnight so the dashboard shows shape, not just a number.
  const upcoming = o.schedule.filter((s) => new Date(s.scheduledAt).getTime() >= Date.now());
  const groups = new Map<string, ScheduledPost[]>();
  for (const p of upcoming.slice(0, 40)) {
    const k = dayKey(p.scheduledAt);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(p);
  }
  const firstGroups = [...groups.entries()].slice(0, 5);

  const perPlatform = new Map<string, number>();
  for (const s of o.schedule) perPlatform.set(s.platform, (perPlatform.get(s.platform) ?? 0) + 1);

  return (
    <div className="container-page py-8 max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-prose">
            Everything queued up across your platforms. Blotato does the publishing —
            this is the view of what&apos;s coming, what went out, and what needs a nudge.
          </p>
        </div>
        <Link
          href="/schedule"
          className="text-sm text-brand hover:underline inline-flex items-center gap-1 shrink-0"
        >
          Full schedule <ArrowUpRight className="size-3.5" />
        </Link>
      </div>

      <div className="space-y-4">
        <FailureBanner count={o.failed.length} />

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat icon={Film} label="Videos queued" value={o.videoCount} accent />
          <Stat icon={Layers} label="Posts scheduled" value={o.quotaUsed} />
          <Stat icon={CalendarDays} label="Runs until" value={o.lastDate ? fmtDay(o.lastDate) : "—"} small />
          <Stat icon={Link2} label="Accounts" value={o.accounts.length} href="/accounts" />
        </div>

        {/* The queue ceiling is the real operational constraint — show it plainly. */}
        <Card className="p-5">
          <div className="flex items-baseline justify-between gap-3 flex-wrap">
            <h2 className="text-sm font-semibold">Queue capacity</h2>
            <span className="text-xs text-muted-foreground tabular-nums">
              {o.quotaUsed} of {SCHEDULE_LIMIT} slots used
            </span>
          </div>
          <div className="mt-3 h-2.5 rounded-full bg-surface-3 overflow-hidden">
            <div
              className={
                o.quotaPct >= 95 ? "h-full bg-destructive" : o.quotaPct >= 80 ? "h-full bg-warning" : "h-full bg-brand"
              }
              style={{ width: `${Math.min(100, o.quotaPct)}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground mt-2.5">
            {o.quotaPct >= 95
              ? "Full. Nothing new can be scheduled until posts publish and free up slots."
              : `${SCHEDULE_LIMIT - o.quotaUsed} slots free. Each video uses one slot per platform.`}
          </p>
          {perPlatform.size > 0 ? (
            <div className="flex gap-4 mt-4 pt-4 border-t border-border flex-wrap">
              {[...perPlatform.entries()].sort().map(([p, n]) => (
                <div key={p} className="flex items-center gap-2">
                  <span
                    className="size-2 rounded-full"
                    style={{ background: PLATFORM_COLOR[p as keyof typeof PLATFORM_COLOR] ?? "#888" }}
                  />
                  <span className="text-xs text-muted-foreground">
                    {PLATFORM_LABEL[p as keyof typeof PLATFORM_LABEL] ?? p}
                  </span>
                  <span className="text-xs font-medium tabular-nums">{n}</span>
                </div>
              ))}
            </div>
          ) : null}
        </Card>

        <Card className="overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border">
            <div>
              <h2 className="text-sm font-semibold">Coming up</h2>
              <p className="text-xs text-muted-foreground mt-0.5">The next few posting days.</p>
            </div>
            <Link href="/schedule" className="text-xs text-brand hover:underline">See all</Link>
          </div>
          {firstGroups.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm text-muted-foreground">Nothing scheduled yet.</p>
            </div>
          ) : (
            firstGroups.map(([date, posts]) => <DayGroup key={date} date={date} posts={posts} />)
          )}
        </Card>
      </div>
    </div>
  );
}

function Stat({
  icon: Icon, label, value, accent, href, small,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string; value: number | string; accent?: boolean; href?: string; small?: boolean;
}) {
  const inner = (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={`${small ? "text-lg" : "text-3xl"} font-semibold tracking-tight tabular-nums mt-2 truncate`}>
          {value}
        </div>
      </div>
      <div
        className={
          accent
            ? "size-8 rounded-md bg-brand/15 border border-brand/30 grid place-items-center shrink-0"
            : "size-8 rounded-md bg-surface-2 border border-border grid place-items-center shrink-0"
        }
      >
        <Icon className={accent ? "size-4 text-brand" : "size-4 text-muted-foreground"} />
      </div>
    </div>
  );
  return (
    <Card className="p-5 transition-colors hover:bg-surface-2/40">
      {href ? <Link href={href} className="block">{inner}</Link> : inner}
    </Card>
  );
}
