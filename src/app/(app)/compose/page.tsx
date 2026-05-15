import type { Metadata } from "next";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { connection, media as mediaTable } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { ComposeForm } from "./compose-form";

export const metadata: Metadata = { title: "Compose" };
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

  let connections: { id: string; platform: string; accountName: string }[] = [];
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
    connections = await db
      .select({
        id: connection.id,
        platform: connection.platform,
        accountName: connection.accountName,
      })
      .from(connection)
      .where(and(eq(connection.userId, userId), eq(connection.isActive, true)));

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
    // DB not configured — fall back to empty
  }

  const timezone = session.user.timezone || "UTC";

  return (
    <ComposeForm
      connections={connections as never}
      timezone={timezone}
      prefillMedia={prefillMedia}
      prefillCaption={sp.caption ?? null}
      prefillSource={sp.source ?? null}
      prefillPermalink={sp.permalink ?? null}
    />
  );
}
