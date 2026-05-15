import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { nanoid } from "nanoid";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { getSession } from "@/lib/session";
import { PLATFORMS } from "@/lib/platforms";

export const runtime = "nodejs";
export const maxDuration = 120;

const bodySchema = z.object({
  sourcePlatform: z.enum(PLATFORMS),
  sourceExternalId: z.string(),
  videoUrl: z.string().url().nullable(),
  thumbnailUrl: z.string().url().nullable(),
  caption: z.string().default(""),
  durationSec: z.number().int().positive().nullable().optional(),
});

/**
 * "Re-run" a video from a connected platform.
 *
 * If videoUrl is provided + downloadable, we fetch the bytes and stash in Vercel
 * Blob, creating a media row. The response includes a mediaId the client
 * uses to deep-link into /compose with the media + caption pre-filled.
 *
 * If videoUrl is null (YouTube, TikTok, LinkedIn — APIs don't expose raw video),
 * we return `{ requiresManualUpload: true, caption, thumbnailUrl }` so the
 * client can navigate to compose with the caption pre-filled and let the user
 * pick a file.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid body" },
      { status: 400 }
    );
  }

  if (!body.videoUrl) {
    return NextResponse.json({
      requiresManualUpload: true,
      caption: body.caption,
      thumbnailUrl: body.thumbnailUrl,
      sourcePlatform: body.sourcePlatform,
    });
  }

  // Fetch the source video
  let buffer: ArrayBuffer;
  let contentType: string;
  let sizeBytes: number;
  try {
    const res = await fetch(body.videoUrl, {
      redirect: "follow",
      headers: { "user-agent": "RoadRunner/1.0 (+https://road-runner.app)" },
    });
    if (!res.ok) {
      return NextResponse.json(
        {
          error: `Source returned ${res.status}. Try the manual upload flow.`,
        },
        { status: 502 }
      );
    }
    contentType = res.headers.get("content-type") || "video/mp4";
    buffer = await res.arrayBuffer();
    sizeBytes = buffer.byteLength;

    // Guard against huge downloads
    if (sizeBytes > 1024 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Source video exceeds 1 GB. Use manual upload." },
        { status: 413 }
      );
    }
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error ? err.message : "Could not fetch source video",
      },
      { status: 502 }
    );
  }

  const ext = inferExtension(contentType, body.videoUrl);
  const key = `videos/${session.user.id}/rerunner/${Date.now()}-${nanoid(8)}.${ext}`;

  let blobUrl: string;
  let blobPath: string;
  try {
    const blob = await put(key, buffer, {
      access: "public",
      contentType,
      addRandomSuffix: false,
    });
    blobUrl = blob.url;
    blobPath = blob.pathname;
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Storage failed — set BLOB_READ_WRITE_TOKEN",
      },
      { status: 500 }
    );
  }

  const mediaId = nanoid();
  await db.insert(media).values({
    id: mediaId,
    userId: session.user.id,
    blobUrl,
    blobPath,
    filename: `${body.sourcePlatform}-${body.sourceExternalId}.${ext}`,
    contentType,
    sizeBytes,
    durationMs: body.durationSec ? body.durationSec * 1000 : null,
    thumbnailUrl: body.thumbnailUrl,
  });

  return NextResponse.json({
    mediaId,
    blobUrl,
    contentType,
    sizeBytes,
    caption: body.caption,
    thumbnailUrl: body.thumbnailUrl,
    sourcePlatform: body.sourcePlatform,
  });
}

function inferExtension(contentType: string, url: string): string {
  const fromCt = contentType.split("/")[1]?.split(";")[0]?.trim();
  if (fromCt && fromCt.length <= 5) return fromCt;
  const u = new URL(url);
  const ext = u.pathname.split(".").pop();
  if (ext && ext.length <= 5) return ext;
  return "mp4";
}
