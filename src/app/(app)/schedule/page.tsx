import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { getOverview } from "@/lib/blotato";
import { FailureBanner } from "@/components/queue-ui";
import { ScheduleFilters } from "./schedule-filters";

export const metadata: Metadata = { title: "Schedule" };
export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const o = await getOverview();

  return (
    <div className="container-page py-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Schedule</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-prose">
          Every post waiting to go out, oldest first. One video posts to several
          platforms at the same time, so they&apos;re grouped together here.
        </p>
      </div>

      <div className="space-y-4">
        <FailureBanner count={o.failed.length} />

        {o.error ? (
          <Card className="p-6 border-destructive/40 bg-destructive/5">
            <p className="text-sm">Couldn&apos;t load the schedule: {o.error}</p>
          </Card>
        ) : o.schedule.length === 0 ? (
          <Card className="px-6 py-16 text-center">
            <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
          </Card>
        ) : (
          <ScheduleFilters posts={o.schedule} />
        )}
      </div>
    </div>
  );
}
