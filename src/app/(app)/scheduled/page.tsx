import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { post, postTarget, media } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { ScheduledView } from "./scheduled-view";

export const metadata: Metadata = { title: "Scheduled" };
export const dynamic = "force-dynamic";

export default async function ScheduledPage() {
  const session = await requireUser();
  const userId = session.user.id;

  let rows: Awaited<ReturnType<typeof getTargets>> = [];
  try {
    rows = await getTargets(userId);
  } catch {
    rows = [];
  }

  return (
    <div className="container-page py-7 max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Scheduled</h1>
          <p className="text-sm text-muted-foreground mt-1">
            All your scheduled and recent posts.
          </p>
        </div>
        <Button asChild variant="brand">
          <Link href="/compose" className="gap-1.5">
            <Plus className="size-4" />
            New short
          </Link>
        </Button>
      </div>

      <ScheduledView rows={rows.map((r) => ({
        id: r.id,
        platform: r.platform,
        status: r.status,
        scheduledAt: r.scheduledAt.toISOString(),
        publishedAt: r.publishedAt?.toISOString() ?? null,
        publishedUrl: r.publishedUrl,
        caption: r.caption ?? "",
        postId: r.postId,
        lastError: r.lastError ?? null,
        attempts: r.attempts,
        thumbnailUrl: r.thumbnailUrl ?? null,
      }))} />
    </div>
  );
}

async function getTargets(userId: string) {
  const rows = await db
    .select({
      id: postTarget.id,
      platform: postTarget.platform,
      status: postTarget.status,
      scheduledAt: postTarget.scheduledAt,
      publishedAt: postTarget.publishedAt,
      publishedUrl: postTarget.publishedUrl,
      lastError: postTarget.lastError,
      attempts: postTarget.attempts,
      postId: postTarget.postId,
      caption: post.caption,
      thumbnailUrl: media.thumbnailUrl,
    })
    .from(postTarget)
    .innerJoin(post, eq(postTarget.postId, post.id))
    .leftJoin(media, eq(post.mediaId, media.id))
    .where(eq(postTarget.userId, userId))
    .orderBy(sql`${postTarget.scheduledAt} ASC`)
    .limit(200);
  return rows;
}
