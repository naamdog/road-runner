import type { Metadata } from "next";
import Link from "next/link";
import { Plus } from "lucide-react";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { post, postTarget, media } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { ScheduledView } from "./scheduled-view";
import { getOrCreateBrands } from "@/lib/brands";
import { readActiveBrandCookie } from "@/lib/active-brand";

export const metadata: Metadata = { title: "Lined up" };
export const dynamic = "force-dynamic";

export default async function ScheduledPage() {
  const session = await requireUser();
  const userId = session.user.id;

  const brands = await getOrCreateBrands(userId);
  const cookieValue = await readActiveBrandCookie();
  const activeBrand =
    brands.find((b) => b.id === cookieValue) ??
    brands.find((b) => b.isDefault) ??
    brands[0];

  let rows: Awaited<ReturnType<typeof getTargets>> = [];
  try {
    rows = await getTargets(userId, activeBrand?.id);
  } catch {
    rows = [];
  }

  return (
    <div className="container-page py-7 max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Lined up</h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
            {activeBrand ? (
              <>
                <span
                  className="size-2 rounded-full"
                  style={{ background: activeBrand.color }}
                />
                Showing posts for <span className="text-foreground font-medium">{activeBrand.name}</span>
              </>
            ) : (
              <>All your lined-up and finished posts.</>
            )}
          </p>
        </div>
        <Button asChild variant="brand">
          <Link href="/compose" className="gap-1.5">
            <Plus className="size-4" />
            New post
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

async function getTargets(userId: string, brandId?: string) {
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
      caption: sql<string>`COALESCE(${postTarget.caption}, ${post.caption})`,
      thumbnailUrl: media.thumbnailUrl,
    })
    .from(postTarget)
    .innerJoin(post, eq(postTarget.postId, post.id))
    .leftJoin(media, eq(post.mediaId, media.id))
    .where(
      brandId
        ? and(eq(postTarget.userId, userId), eq(post.brandId, brandId))
        : eq(postTarget.userId, userId)
    )
    .orderBy(sql`${postTarget.scheduledAt} ASC`)
    .limit(200);
  return rows;
}
