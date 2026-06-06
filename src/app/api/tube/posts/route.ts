import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tubePost, media, connection } from "@/lib/db/schema";
import { getSession } from "@/lib/session";
import { readActiveBrandCookie } from "@/lib/active-brand";
import { getOrCreateBrands } from "@/lib/brands";

const mediaSchema = z.object({
  url: z.string().url(),
  /** Real blob pathname (preferred for blobPath). Falls back to a url split if absent. */
  pathname: z.string().optional(),
  filename: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().nonnegative(),
  durationMs: z.number().int().nullable().optional(),
});

const bodySchema = z
  .object({
    connectionId: z.string().min(1),
    title: z.string().min(1).max(100),
    description: z.string().max(5000).default(""),
    tags: z.array(z.string().min(1).max(60)).max(50).default([]),
    categoryId: z.string().default("22"),
    visibility: z.enum(["public", "unlisted", "private"]).default("public"),
    madeForKids: z.boolean().default(false),
    scheduledAt: z.string().datetime(),
    media: mediaSchema.optional(),
    existingMediaId: z.string().optional(),
    thumbnailUrl: z.string().url().nullable().optional(),
    playlistId: z.string().nullable().optional(),
    brandId: z.string().optional(),
  })
  .refine((b) => Boolean(b.media || b.existingMediaId), {
    message: "A video is required.",
  });

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Bad request" },
      { status: 400 }
    );
  }

  const userId = session.user.id;

  // Verify connection belongs to user + is YouTube
  const [conn] = await db
    .select({ id: connection.id, platform: connection.platform, brandId: connection.brandId })
    .from(connection)
    .where(
      and(eq(connection.id, parsed.connectionId), eq(connection.userId, userId))
    );
  if (!conn) {
    return NextResponse.json({ error: "YouTube account not found" }, { status: 404 });
  }
  if (conn.platform !== "youtube") {
    return NextResponse.json(
      { error: "Pick a YouTube account for YouTube Long Form posts" },
      { status: 400 }
    );
  }

  // Resolve brand
  const brands = await getOrCreateBrands(userId);
  let brandId: string | null = null;
  if (parsed.brandId) {
    brandId = brands.find((b) => b.id === parsed.brandId)?.id ?? null;
  } else {
    const cookieValue = await readActiveBrandCookie();
    brandId =
      brands.find((b) => b.id === cookieValue)?.id ??
      brands.find((b) => b.isDefault)?.id ??
      brands[0]?.id ??
      null;
  }

  // Validate existing media (read) up front so we can fail with a clear status
  // before opening a transaction.
  if (parsed.existingMediaId) {
    const [m] = await db
      .select({ id: media.id })
      .from(media)
      .where(
        and(eq(media.id, parsed.existingMediaId), eq(media.userId, userId))
      );
    if (!m) {
      return NextResponse.json({ error: "Video not found" }, { status: 404 });
    }
  } else if (!parsed.media) {
    return NextResponse.json({ error: "Missing video" }, { status: 400 });
  }

  const scheduledAt = new Date(parsed.scheduledAt);
  if (scheduledAt.getTime() <= Date.now() + 60_000) {
    return NextResponse.json(
      { error: "Pick a time at least one minute in the future" },
      { status: 400 }
    );
  }

  const id = nanoid();
  const newMedia = parsed.media;

  // Prefer the real blob pathname; fall back to the legacy url split.
  const blobPath = newMedia
    ? newMedia.pathname ?? newMedia.url.split("/").slice(-2).join("/")
    : null;

  // Wrap media + tube_post inserts in one transaction so a partial failure
  // can't leave orphaned media or a tube_post without its media.
  await db.transaction(async (tx) => {
    let mediaId: string;
    if (parsed.existingMediaId) {
      mediaId = parsed.existingMediaId;
    } else {
      // newMedia is guaranteed present here (validated above).
      mediaId = nanoid();
      await tx.insert(media).values({
        id: mediaId,
        userId,
        blobUrl: newMedia!.url,
        blobPath: blobPath!,
        filename: newMedia!.filename,
        contentType: newMedia!.contentType,
        sizeBytes: newMedia!.sizeBytes,
        durationMs: newMedia!.durationMs ?? null,
      });
    }

    await tx.insert(tubePost).values({
      id,
      userId,
      brandId,
      connectionId: parsed.connectionId,
      mediaId,
      thumbnailUrl: parsed.thumbnailUrl ?? null,
      title: parsed.title,
      description: parsed.description,
      tags: parsed.tags,
      categoryId: parsed.categoryId,
      visibility: parsed.visibility,
      madeForKids: parsed.madeForKids,
      playlistId: parsed.playlistId ?? null,
      scheduledAt,
      status: "scheduled",
    });
  });

  return NextResponse.json({ id });
}
