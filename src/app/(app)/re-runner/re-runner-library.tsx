import Link from "next/link";
import { Library as LibraryIcon, Plus } from "lucide-react";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { media, post, postTarget } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LibraryGrid } from "./library-grid";

export async function ReRunnerLibrary() {
  const session = await requireUser();
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
    .limit(24);

  const items = rows
    .filter((r) => Number(r.publishedCount) > 0)
    .map((r) => ({
      mediaId: r.mediaId,
      blobUrl: r.blobUrl,
      filename: r.filename,
      contentType: r.contentType,
      sizeBytes: Number(r.sizeBytes),
      durationMs: r.durationMs,
      thumbnailUrl: r.thumbnailUrl,
      postId: r.postId,
      caption: r.caption,
      publishedCount: Number(r.publishedCount),
      lastPublishedAt: r.lastPublishedAt?.toISOString() ?? null,
    }));

  if (items.length === 0) {
    return (
      <Card className="p-8 text-center">
        <div className="size-11 mx-auto rounded-md bg-surface-2 border border-border flex items-center justify-center">
          <LibraryIcon className="size-5 text-muted-foreground" />
        </div>
        <h3 className="mt-3 text-sm font-semibold">No library items yet</h3>
        <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
          Once you publish a short through Road Runner, it'll appear here ready
          to instant-rerun.
        </p>
        <Button asChild variant="brand" size="sm" className="mt-4 gap-1.5">
          <Link href="/compose">
            <Plus className="size-3.5" />
            Schedule your first short
          </Link>
        </Button>
      </Card>
    );
  }

  return <LibraryGrid items={items} />;
}
