import Link from "next/link";
import { Link2, AlertTriangle, Info } from "lucide-react";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { connection } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { fetchers, popularityScore, type PopularVideo } from "@/lib/rerunner";
import { PLATFORM_META, type Platform } from "@/lib/platforms";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PlatformIcon } from "@/components/platform-icon";
import { ReRunnerGrid } from "./re-runner-grid";
import { getOrCreateBrands } from "@/lib/brands";
import { readActiveBrandCookie } from "@/lib/active-brand";

/**
 * Why a connected platform may show no videos here. These feeds intentionally
 * return [] when the platform's API can't list a user's past videos — see
 * src/lib/rerunner/{tiktok,linkedin}.ts. We explain it instead of leaving a
 * blank grid.
 */
const EMPTY_PLATFORM_NOTE: Partial<Record<Platform, string>> = {
  tiktok:
    "TikTok's API can't list your past videos for most apps (the video.list scope is rarely granted), so this feed stays empty. Re-run TikToks manually from Compose.",
  linkedin:
    "LinkedIn has no API to list an individual's past video posts, so this feed stays empty. Re-run LinkedIn videos manually from Compose.",
};

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
  // Platforms that fetched fine but returned nothing — usually an API limit.
  const emptyPlatforms = new Set<Platform>();
  settled.forEach((r, i) => {
    const platform = conns[i].platform as Platform;
    if (r.status === "fulfilled") {
      if (r.value.length === 0) emptyPlatforms.add(platform);
      videos.push(...r.value);
    } else {
      errors.push({
        platform,
        error: r.reason instanceof Error ? r.reason.message : "Failed",
      });
    }
  });
  videos.sort((a, b) => popularityScore(b) - popularityScore(a));

  // Platforms with a known "can't list past videos" reason, that the user
  // actually connected and that came back empty.
  const explainedEmpty = Array.from(emptyPlatforms).filter(
    (p) => p in EMPTY_PLATFORM_NOTE
  );
  // Other connected platforms that came back empty for an ordinary reason
  // (nothing posted yet, or no token).
  const plainEmpty = Array.from(emptyPlatforms).filter(
    (p) => !(p in EMPTY_PLATFORM_NOTE)
  );

  if (videos.length === 0 && errors.length === 0) {
    return (
      <Card className="p-8 sm:p-10 text-center">
        <div className="size-11 mx-auto rounded-md bg-surface-2 border border-border flex items-center justify-center">
          <Info className="size-5 text-muted-foreground" />
        </div>
        <h3 className="mt-3 text-sm font-semibold">
          Nothing to show from these apps yet
        </h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
          {plainEmpty.length > 0 && explainedEmpty.length === 0
            ? "We didn't find any short-form posts on your connected accounts yet. Once you post some, they'll show up here ranked by views."
            : "Some apps don't let us list your past videos through their API, so those feeds stay empty — you can still re-run them manually."}
        </p>

        {explainedEmpty.length > 0 ? (
          <ul className="mt-4 space-y-2 text-left max-w-md mx-auto">
            {explainedEmpty.map((p) => (
              <li
                key={p}
                className="flex items-start gap-2.5 rounded-md border border-border bg-surface-2/60 p-3"
              >
                <PlatformIcon platform={p} size={16} className="mt-0.5" />
                <div className="text-xs">
                  <div className="font-medium text-foreground">
                    {PLATFORM_META[p].name}
                  </div>
                  <p className="mt-0.5 text-muted-foreground">
                    {EMPTY_PLATFORM_NOTE[p]}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        <Button asChild variant="outline" size="sm" className="mt-5">
          <Link href="/compose">Re-run manually from Compose</Link>
        </Button>
      </Card>
    );
  }

  return (
    <>
      {explainedEmpty.length > 0 ? (
        <Card className="mb-4 p-3 border-info/30 bg-info/5 flex items-start gap-2 text-xs">
          <Info className="size-4 text-info shrink-0 mt-0.5" />
          <div>
            <div className="text-foreground font-medium">
              Some feeds can't be listed automatically
            </div>
            <ul className="mt-1 text-muted-foreground space-y-0.5">
              {explainedEmpty.map((p) => (
                <li key={p}>
                  <span className="text-foreground">{PLATFORM_META[p].name}</span>
                  : {EMPTY_PLATFORM_NOTE[p]}
                </li>
              ))}
            </ul>
          </div>
        </Card>
      ) : null}
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
