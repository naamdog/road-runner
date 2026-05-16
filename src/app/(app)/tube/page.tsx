import type { Metadata } from "next";
import Link from "next/link";
import { Plus, Tv } from "lucide-react";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tubePost, connection } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { getOrCreateBrands } from "@/lib/brands";
import { readActiveBrandCookie } from "@/lib/active-brand";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TubeList, type TubeRow } from "./tube-list";

export const metadata: Metadata = { title: "TubeRunner" };
export const dynamic = "force-dynamic";

export default async function TubePage() {
  const session = await requireUser();
  const userId = session.user.id;

  const brands = await getOrCreateBrands(userId);
  const cookieValue = await readActiveBrandCookie();
  const activeBrand =
    brands.find((b) => b.id === cookieValue) ??
    brands.find((b) => b.isDefault) ??
    brands[0];

  let rows: TubeRow[] = [];
  let hasYouTube = false;
  try {
    const where = activeBrand
      ? and(eq(tubePost.userId, userId), eq(tubePost.brandId, activeBrand.id))
      : eq(tubePost.userId, userId);

    const data = await db
      .select({
        id: tubePost.id,
        title: tubePost.title,
        description: tubePost.description,
        thumbnailUrl: tubePost.thumbnailUrl,
        visibility: tubePost.visibility,
        status: tubePost.status,
        scheduledAt: tubePost.scheduledAt,
        publishedAt: tubePost.publishedAt,
        publishedUrl: tubePost.publishedUrl,
        lastError: tubePost.lastError,
      })
      .from(tubePost)
      .where(where)
      .orderBy(desc(tubePost.scheduledAt))
      .limit(100);

    rows = data.map((r) => ({
      id: r.id,
      title: r.title,
      description: r.description,
      thumbnailUrl: r.thumbnailUrl,
      visibility: r.visibility as "public" | "unlisted" | "private",
      status: r.status,
      scheduledAt: r.scheduledAt.toISOString(),
      publishedAt: r.publishedAt?.toISOString() ?? null,
      publishedUrl: r.publishedUrl,
      lastError: r.lastError,
    }));

    const ytWhere = activeBrand
      ? and(
          eq(connection.userId, userId),
          eq(connection.brandId, activeBrand.id),
          eq(connection.platform, "youtube"),
          eq(connection.isActive, true)
        )
      : and(
          eq(connection.userId, userId),
          eq(connection.platform, "youtube"),
          eq(connection.isActive, true)
        );
    const [yt] = await db
      .select({ id: connection.id })
      .from(connection)
      .where(ytWhere)
      .limit(1);
    hasYouTube = Boolean(yt);
  } catch {
    rows = [];
  }

  return (
    <div className="container-page py-7 max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Tv className="size-5 text-brand" />
            TubeRunner
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            {activeBrand ? (
              <>
                <span
                  className="size-2 rounded-full"
                  style={{ background: activeBrand.color }}
                />
                Long videos for YouTube — posting for <span className="text-foreground font-medium">{activeBrand.name}</span>
              </>
            ) : (
              <>Long videos for YouTube — title, description, thumbnail, the works.</>
            )}
          </p>
        </div>
        <Button asChild variant="brand" disabled={!hasYouTube}>
          <Link href="/tube/compose" className="gap-1.5">
            <Plus className="size-4" />
            New video
          </Link>
        </Button>
      </div>

      {!hasYouTube ? (
        <Card className="p-10 text-center mb-6">
          <div className="size-11 mx-auto rounded-md bg-surface-2 border border-border flex items-center justify-center">
            <Tv className="size-5 text-muted-foreground" />
          </div>
          <h3 className="mt-3 text-sm font-semibold">
            Connect YouTube to use TubeRunner
          </h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
            TubeRunner posts go to YouTube as full videos. Connect a YouTube
            account to this brand to start.
          </p>
          <Button asChild variant="brand" size="sm" className="mt-4">
            <Link href="/connections">Connect YouTube</Link>
          </Button>
        </Card>
      ) : null}

      <TubeList rows={rows} />
    </div>
  );
}
