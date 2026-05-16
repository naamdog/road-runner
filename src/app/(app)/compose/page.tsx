import type { Metadata } from "next";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { connection, media as mediaTable } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { getOrCreateBrands } from "@/lib/brands";
import { readActiveBrandCookie } from "@/lib/active-brand";
import { ComposeForm, type ComposeConnection } from "./compose-form";

export const metadata: Metadata = { title: "New post" };
export const dynamic = "force-dynamic";

interface SP {
  media?: string;
  caption?: string;
  source?: string;
  permalink?: string;
}

export default async function ComposePage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const session = await requireUser();
  const userId = session.user.id;
  const sp = await searchParams;

  const brands = await getOrCreateBrands(userId);
  const cookieValue = await readActiveBrandCookie();
  const activeBrand =
    brands.find((b) => b.id === cookieValue) ??
    brands.find((b) => b.isDefault) ??
    brands[0];

  let connections: ComposeConnection[] = [];
  let prefillMedia: {
    mediaId: string;
    url: string;
    contentType: string;
    sizeBytes: number;
    durationMs: number | null;
    filename: string;
    thumbnailUrl: string | null;
  } | null = null;

  try {
    if (activeBrand) {
      const rows = await db
        .select({
          id: connection.id,
          platform: connection.platform,
          accountName: connection.accountName,
          accountHandle: connection.accountHandle,
          avatarUrl: connection.avatarUrl,
          brandId: connection.brandId,
        })
        .from(connection)
        .where(
          and(
            eq(connection.userId, userId),
            eq(connection.brandId, activeBrand.id),
            eq(connection.isActive, true)
          )
        );
      connections = rows;
    }

    if (sp.media) {
      const [m] = await db
        .select()
        .from(mediaTable)
        .where(and(eq(mediaTable.id, sp.media), eq(mediaTable.userId, userId)));
      if (m) {
        prefillMedia = {
          mediaId: m.id,
          url: m.blobUrl,
          contentType: m.contentType,
          sizeBytes: Number(m.sizeBytes),
          durationMs: m.durationMs,
          filename: m.filename,
          thumbnailUrl: m.thumbnailUrl,
        };
      }
    }
  } catch {
    // DB not configured — render with empty state
  }

  const timezone = session.user.timezone || "UTC";

  return (
    <ComposeForm
      connections={connections}
      activeBrand={
        activeBrand
          ? { id: activeBrand.id, name: activeBrand.name, color: activeBrand.color }
          : null
      }
      timezone={timezone}
      prefillMedia={prefillMedia}
      prefillCaption={sp.caption ?? null}
      prefillSource={sp.source ?? null}
      prefillPermalink={sp.permalink ?? null}
    />
  );
}
