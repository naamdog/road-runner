import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { post, postTarget, media, connection } from "@/lib/db/schema";
import { getSession } from "@/lib/session";
import { PLATFORMS } from "@/lib/platforms";

const targetSchema = z.object({
  platform: z.enum(PLATFORMS),
  scheduledAt: z.string().datetime(),
  connectionId: z.string().nullable().optional(),
});

const mediaSchema = z.object({
  url: z.string().url(),
  filename: z.string(),
  contentType: z.string(),
  sizeBytes: z.number().nonnegative(),
  durationMs: z.number().int().nullable().optional(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
});

const bodySchema = z
  .object({
    caption: z.string().max(63206),
    title: z.string().max(200).optional().nullable(),
    media: mediaSchema.optional(),
    existingMediaId: z.string().optional(),
    targets: z.array(targetSchema).min(1).max(20),
  })
  .refine((b) => Boolean(b.media || b.existingMediaId), {
    message: "Either media or existingMediaId is required",
  });

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid body" },
      { status: 400 }
    );
  }

  // Verify any specified connections belong to this user
  if (parsed.targets.some((t) => t.connectionId)) {
    const ids = parsed.targets
      .map((t) => t.connectionId)
      .filter((id): id is string => Boolean(id));
    const rows = await db
      .select({ id: connection.id })
      .from(connection)
      .where(eq(connection.userId, session.user.id));
    const owned = new Set(rows.map((r) => r.id));
    for (const id of ids) {
      if (!owned.has(id)) {
        return NextResponse.json({ error: "Connection not found" }, { status: 403 });
      }
    }
  }

  const userId = session.user.id;
  let mediaId: string;

  if (parsed.existingMediaId) {
    const [m] = await db
      .select({ id: media.id })
      .from(media)
      .where(
        and(eq(media.id, parsed.existingMediaId), eq(media.userId, userId))
      );
    if (!m) {
      return NextResponse.json({ error: "Media not found" }, { status: 404 });
    }
    mediaId = m.id;
  } else if (parsed.media) {
    mediaId = nanoid();
    await db.insert(media).values({
      id: mediaId,
      userId,
      blobUrl: parsed.media.url,
      blobPath: parsed.media.url.split("/").slice(-2).join("/"),
      filename: parsed.media.filename,
      contentType: parsed.media.contentType,
      sizeBytes: parsed.media.sizeBytes,
      durationMs: parsed.media.durationMs ?? null,
      width: parsed.media.width ?? null,
      height: parsed.media.height ?? null,
    });
  } else {
    return NextResponse.json({ error: "Missing media" }, { status: 400 });
  }

  const postId = nanoid();
  await db.insert(post).values({
    id: postId,
    userId,
    mediaId,
    caption: parsed.caption,
    title: parsed.title ?? null,
  });

  const targets = parsed.targets.map((t) => ({
    id: nanoid(),
    postId,
    userId,
    platform: t.platform,
    connectionId: t.connectionId ?? null,
    scheduledAt: new Date(t.scheduledAt),
    status: t.connectionId ? ("scheduled" as const) : ("draft" as const),
  }));

  if (targets.length > 0) {
    await db.insert(postTarget).values(targets);
  }

  return NextResponse.json({ id: postId, targets: targets.length });
}
