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
import { getOrCreateBrands } from "@/lib/brands";
import { readActiveBrandCookie } from "@/lib/active-brand";

export async function ReRunnerFeed() {
  const session = await requireUser();
  const userId = session.user.id;

  const brands = await getOrCreateBrands(userId);
  const cookieValue = await readActiveBrandCookie();
  const activeBrand =
    brands.find((b) => b.id === cookieValue) ??
    brands.find((b) => b.isDefault) ??
    brands[0];

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
      activeBrand
        ? and(
            eq(connection.userId, userId),
            eq(connection.brandId, activeBrand.id),
            eq(connection.isActive, true)
          )
        : and(eq(connection.userId, userId), eq(connection.isActive, true))
    );

  if (conns.length === 0) {
    return (
      <Card className="p-10 text-center">
        <div className="size-11 mx-auto rounded-md bg-surface-2 border border-border flex items-center justify-center">
          <Link2 className="size-5 text-muted-foreground" />
        </div>
        <h3 className="mt-3 text-sm font-semibold">No accounts connected yet</h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
          Connect at least one social account to see your best videos here.
        </p>
        <Button asChild variant="brand" size="sm" className="mt-4">
          <Link href="/connections">Connect an account</Link>
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
        <h3 className="text-sm font-semibold">No videos yet</h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
          We didn't find any short-form posts on your accounts yet. Once you
          post some, they'll show up here ranked by views.
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
              Some apps could not load
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
