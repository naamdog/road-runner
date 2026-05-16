import type { Metadata } from "next";
import { Suspense } from "react";
import { Library, Repeat, Sparkles } from "lucide-react";
import { requireUser } from "@/lib/session";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ReRunnerFeed } from "./re-runner-feed";
import { ReRunnerLibrary } from "./re-runner-library";

export const metadata: Metadata = { title: "Re-runner" };
export const dynamic = "force-dynamic";

export default async function ReRunnerPage() {
  await requireUser();
  return (
    <div className="container-page py-7 max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <div className="inline-flex items-center gap-1.5 rounded-full border border-brand/40 bg-brand/10 px-2 py-0.5 text-[11px] text-brand font-medium">
              <Sparkles className="size-3" />
              New
            </div>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Repeat className="size-5 text-brand" />
            Re-runner
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            See your best videos from every app you connected. Tap one to grab
            the original and post it again, fast.
          </p>
        </div>
      </div>

      <section className="mb-10">
        <SectionHeader
          icon={Library}
          title="From your library"
          description="Videos you already posted through Road Runner. The file is here, so re-running takes one tap."
        />
        <Suspense fallback={<GridSkeleton count={3} />}>
          <ReRunnerLibrary />
        </Suspense>
      </section>

      <section>
        <SectionHeader
          icon={Repeat}
          title="Your best, by app"
          description="Pulled live from every app you connected. Sorted by views (or by likes if views aren't shared)."
        />
        <Suspense fallback={<GridSkeleton count={6} />}>
          <ReRunnerFeed />
        </Suspense>
      </section>
    </div>
  );
}

function SectionHeader({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 mb-3">
      <div>
        <h2 className="text-base font-semibold tracking-tight flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" />
          {title}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">
          {description}
        </p>
      </div>
    </div>
  );
}

function GridSkeleton({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i} className="p-0 overflow-hidden">
          <Skeleton className="aspect-[9/16] w-full" />
          <div className="p-3 space-y-2">
            <Skeleton className="h-3 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </Card>
      ))}
    </div>
  );
}
