import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { connection } from "@/lib/db/schema";
import { getSession } from "@/lib/session";
import { fetchers, popularityScore, type PopularVideo } from "@/lib/rerunner";
import type { Platform } from "@/lib/platforms";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const connections = await db
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
      and(
        eq(connection.userId, session.user.id),
        eq(connection.isActive, true)
      )
    );

  const settled = await Promise.allSettled(
    connections.map(async (c) => {
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
        platform: connections[i].platform as Platform,
        error: r.reason instanceof Error ? r.reason.message : "Fetch failed",
      });
    }
  });

  videos.sort((a, b) => popularityScore(b) - popularityScore(a));

  return NextResponse.json({
    videos,
    errors,
    connectionsCount: connections.length,
    fetchedAt: new Date().toISOString(),
  });
}
