import Link from "next/link";
import { Link2, AlertTriangle } from "lucide-react";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { connection } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { fetchers, popularityScore, type PopularVideo } from "@/lib/rerunner";
import type { Platform } from "@/lib/platforms";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ReRunnerGrid } from "./re-runner-grid";

export async function ReRunnerFeed() {
  const session = await requireUser();
  const userId = session.user.id;

  const conns = await db
    .select({
      id: connection.id,
      platform: connection.platform,
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken,
      metadata: connection.metadata,
      accountId: connection.accountId,
      accountName: connection.accountName,
      accountHandle: connection.accountHandle,
    })
    .from(connection)
    .where(
      and(eq(connection.userId, userId), eq(connection.isActive, true))
    );

  if (conns.length === 0) {
    return (
      <Card className="p-10 text-center">
        <div className="size-11 mx-auto rounded-md bg-surface-2 border border-border flex items-center justify-center">
          <Link2 className="size-5 text-muted-foreground" />
        </div>
        <h3 className="mt-3 text-sm font-semibold">No platforms connected</h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
          Connect at least one platform to see your top-performing videos here.
        </p>
        <Button asChild variant="brand" size="sm" className="mt-4">
          <Link href="/connections">Connect a platform</Link>
        </Button>
      </Card>
    );
  }

  const settled = await Promise.allSettled(
    conns.map(async (c) => {
      if (!c.accessToken) return [] as PopularVideo[];
      const fetcher = fetchers[c.platform as Platform];
      return fetcher({
        connectionId: c.id,
        accessToken: c.accessToken,
        refreshToken: c.refreshToken,
        metadata: c.metadata as Record<string, unknown> | null,
        accountId: c.accountId,
        accountName: c.accountName,
        accountHandle: c.accountHandle,
        limit: 12,
      });
    })
  );

  const videos: PopularVideo[] = [];
  const errors: { platform: Platform; error: string }[] = [];
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") {
      videos.push(...r.value);
    } else {
      errors.push({
        platform: conns[i].platform as Platform,
        error: r.reason instanceof Error ? r.reason.message : "Failed",
      });
    }
  });
  videos.sort((a, b) => popularityScore(b) - popularityScore(a));

  if (videos.length === 0 && errors.length === 0) {
    return (
      <Card className="p-10 text-center">
        <h3 className="text-sm font-semibold">No public shorts yet</h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
          We didn't find any short-form video posts on your connected
          platforms. Once you publish some, they'll show up here ranked by
          views.
        </p>
      </Card>
    );
  }

  return (
    <>
      {errors.length > 0 ? (
        <Card className="mb-4 p-3 border-warning/30 bg-warning/5 flex items-start gap-2 text-xs">
          <AlertTriangle className="size-4 text-warning shrink-0 mt-0.5" />
          <div>
            <div className="text-foreground font-medium">
              Some platforms could not be fetched
            </div>
            <ul className="mt-1 text-muted-foreground space-y-0.5">
              {errors.map((e) => (
                <li key={e.platform}>
                  <span className="text-foreground capitalize">
                    {e.platform}
                  </span>
                  : {e.error}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      ) : null}
      <ReRunnerGrid videos={videos} />
    </>
  );
}
