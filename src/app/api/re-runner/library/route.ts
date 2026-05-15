import { NextResponse } from "next/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { media, post, postTarget } from "@/lib/db/schema";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Videos you've already posted *through* Road Runner — the source files are in
 * our Blob storage, so a re-run is a one-click pre-fill with no download step.
 */
export async function GET() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = session.user.id;

  const rows = await db
    .select({
      mediaId: media.id,
      blobUrl: media.blobUrl,
      filename: media.filename,
      contentType: media.contentType,
      sizeBytes: media.sizeBytes,
      durationMs: media.durationMs,
      thumbnailUrl: media.thumbnailUrl,
      mediaCreatedAt: media.createdAt,
      postId: post.id,
      caption: post.caption,
      publishedCount: sql<number>`COUNT(${postTarget.id})`,
      lastPublishedAt: sql<Date | null>`MAX(${postTarget.publishedAt})`,
    })
    .from(media)
    .innerJoin(post, eq(post.mediaId, media.id))
    .leftJoin(
      postTarget,
      and(
        eq(postTarget.postId, post.id),
        eq(postTarget.status, "published")
      )
    )
    .where(eq(media.userId, userId))
    .groupBy(media.id, post.id)
    .orderBy(desc(media.createdAt))
    .limit(60);

  const items = rows
    .filter((r) => r.publishedCount > 0)
    .map((r) => ({
      mediaId: r.mediaId,
      blobUrl: r.blobUrl,
      filename: r.filename,
      contentType: r.contentType,
      sizeBytes: r.sizeBytes,
      durationMs: r.durationMs,
      thumbnailUrl: r.thumbnailUrl,
      postId: r.postId,
      caption: r.caption,
      publishedCount: Number(r.publishedCount),
      lastPublishedAt: r.lastPublishedAt?.toISOString() ?? null,
      mediaCreatedAt: r.mediaCreatedAt.toISOString(),
    }));

  return NextResponse.json({ items });
}
