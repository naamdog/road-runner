import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { getOverview } from "@/lib/blotato";
import { DayGroup, FailureBanner, dayKey } from "@/components/queue-ui";
import type { ScheduledPost } from "@/lib/blotato";

export const metadata: Metadata = { title: "Schedule" };
export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const o = await getOverview();

  const groups = new Map<string, ScheduledPost[]>();
  for (const p of o.schedule) {
    const k = dayKey(p.scheduledAt);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(p);
  }
  const entries = [...groups.entries()];
  const videos = new Set(o.schedule.map((s) => s.mediaUrl ?? s.text)).size;

  return (
    <div className="container-page py-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Every post waiting to go out, oldest first. One video posts to several
          platforms at the same time, so they&apos;re grouped together here.
        </p>
        <p className="text-sm text-muted-foreground mt-2 tabular-nums">
          <span className="text-foreground font-medium">{videos}</span> videos ·{" "}
          <span className="text-foreground font-medium">{o.schedule.length}</span> posts ·{" "}
          <span className="text-foreground font-medium">{entries.length}</span> posting days
        </p>
      </div>

      <div className="space-y-4">
        <FailureBanner count={o.failed.length} />

        {o.error ? (
          <Card className="p-6 border-destructive/40 bg-destructive/5">
            <p className="text-sm">Couldn&apos;t load the schedule: {o.error}</p>
          </Card>
        ) : entries.length === 0 ? (
          <Card className="px-6 py-16 text-center">
            <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            {entries.map(([date, posts]) => (
              <DayGroup key={date} date={date} posts={posts} />
            ))}
          </Card>
        )}
      </div>
    </div>
  );
}
