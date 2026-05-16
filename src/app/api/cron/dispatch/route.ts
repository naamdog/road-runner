import { NextRequest, NextResponse } from "next/server";
import { and, eq, lte, or, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { postTarget, post, media, connection, tubePost } from "@/lib/db/schema";
import { publishers, PublisherError } from "@/lib/publishers";
import { publishYouTubeLongform } from "@/lib/publishers/youtube-longform";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min per cron invocation

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 10;

/**
 * Cron dispatcher — runs every minute via Vercel Cron.
 *
 * Picks up two kinds of due work:
 *   1. `post_target` rows (short-form, multi-platform fan-out)
 *   2. `tube_post` rows (long-form YouTube uploads)
 *
 * Each is marked `publishing`, attempted, and updated to `published` or
 * `failed` (with exponential-backoff retries up to 3 attempts).
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const shortResults = await processShortForm(now);
  const tubeResults = await processTubeRunner(now);

  return NextResponse.json({
    short: shortResults,
    tube: tubeResults,
    at: now.toISOString(),
  });
}

async function processShortForm(now: Date) {
  const due = await db
    .select({
      id: postTarget.id,
      platform: postTarget.platform,
      connectionId: postTarget.connectionId,
      attempts: postTarget.attempts,
      postId: postTarget.postId,
      userId: postTarget.userId,
      targetCaption: postTarget.caption,
    })
    .from(postTarget)
    .where(
      and(
        eq(postTarget.status, "scheduled"),
        lte(postTarget.scheduledAt, now),
        or(
          isNull(postTarget.nextAttemptAt),
          lte(postTarget.nextAttemptAt, now)
        )
      )
    )
    .orderBy(sql`${postTarget.scheduledAt} ASC`)
    .limit(BATCH_SIZE);

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const row of due) {
    await db
      .update(postTarget)
      .set({
        status: "publishing",
        lastAttemptAt: now,
        attempts: row.attempts + 1,
        updatedAt: now,
      })
      .where(eq(postTarget.id, row.id));

    try {
      if (!row.connectionId) {
        throw new PublisherError("No account for this app", false);
      }
      const [p] = await db
        .select({
          caption: post.caption,
          title: post.title,
          videoUrl: media.blobUrl,
          contentType: media.contentType,
          durationMs: media.durationMs,
        })
        .from(post)
        .leftJoin(media, eq(post.mediaId, media.id))
        .where(eq(post.id, row.postId));

      if (!p?.videoUrl) {
        throw new PublisherError("Post has no video attached", false);
      }

      const [conn] = await db
        .select({
          accessToken: connection.accessToken,
          refreshToken: connection.refreshToken,
          metadata: connection.metadata,
          accountId: connection.accountId,
          accountName: connection.accountName,
        })
        .from(connection)
        .where(eq(connection.id, row.connectionId));

      if (!conn?.accessToken) {
        throw new PublisherError("Account missing access token", false);
      }

      const result = await publishers[row.platform]({
        videoUrl: p.videoUrl,
        caption: row.targetCaption ?? p.caption,
        title: p.title,
        durationMs: p.durationMs,
        contentType: p.contentType,
        accessToken: conn.accessToken,
        refreshToken: conn.refreshToken,
        metadata: conn.metadata as Record<string, unknown> | null,
        accountId: conn.accountId,
        accountName: conn.accountName,
      });

      await db
        .update(postTarget)
        .set({
          status: "published",
          publishedUrl: result.publishedUrl,
          publishedAt: new Date(),
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(postTarget.id, row.id));

      results.push({ id: row.id, ok: true });
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      const retryable = err instanceof PublisherError ? err.retryable : true;
      const newAttempts = row.attempts + 1;
      const exhausted = newAttempts >= MAX_ATTEMPTS;
      const backoffMs = Math.min(
        15 * 60 * 1000,
        Math.pow(2, newAttempts) * 60 * 1000
      );
      const nextAt = new Date(Date.now() + backoffMs);

      await db
        .update(postTarget)
        .set({
          status: !retryable || exhausted ? "failed" : "scheduled",
          lastError: error.slice(0, 1000),
          nextAttemptAt: !retryable || exhausted ? null : nextAt,
          updatedAt: new Date(),
        })
        .where(eq(postTarget.id, row.id));

      results.push({ id: row.id, ok: false, error });
    }
  }

  return { processed: results.length, results };
}

async function processTubeRunner(now: Date) {
  const due = await db
    .select({
      id: tubePost.id,
      attempts: tubePost.attempts,
      connectionId: tubePost.connectionId,
      mediaId: tubePost.mediaId,
      thumbnailUrl: tubePost.thumbnailUrl,
      title: tubePost.title,
      description: tubePost.description,
      tags: tubePost.tags,
      categoryId: tubePost.categoryId,
      visibility: tubePost.visibility,
      madeForKids: tubePost.madeForKids,
    })
    .from(tubePost)
    .where(
      and(
        eq(tubePost.status, "scheduled"),
        lte(tubePost.scheduledAt, now),
        or(isNull(tubePost.nextAttemptAt), lte(tubePost.nextAttemptAt, now))
      )
    )
    .orderBy(sql`${tubePost.scheduledAt} ASC`)
    .limit(BATCH_SIZE);

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const row of due) {
    await db
      .update(tubePost)
      .set({
        status: "publishing",
        lastAttemptAt: now,
        attempts: row.attempts + 1,
        updatedAt: now,
      })
      .where(eq(tubePost.id, row.id));

    try {
      if (!row.connectionId) {
        throw new PublisherError("No YouTube account connected", false);
      }
      if (!row.mediaId) {
        throw new PublisherError("Post has no video", false);
      }
      const [m] = await db
        .select({ url: media.blobUrl })
        .from(media)
        .where(eq(media.id, row.mediaId));
      if (!m?.url) {
        throw new PublisherError("Video file is missing", false);
      }
      const [conn] = await db
        .select({ accessToken: connection.accessToken })
        .from(connection)
        .where(eq(connection.id, row.connectionId));
      if (!conn?.accessToken) {
        throw new PublisherError("YouTube account missing access token", false);
      }

      const result = await publishYouTubeLongform({
        accessToken: conn.accessToken,
        videoUrl: m.url,
        title: row.title,
        description: row.description,
        tags: (row.tags as string[] | null) ?? [],
        categoryId: row.categoryId,
        visibility: row.visibility as "public" | "unlisted" | "private",
        madeForKids: row.madeForKids,
        thumbnailUrl: row.thumbnailUrl,
      });

      await db
        .update(tubePost)
        .set({
          status: "published",
          publishedUrl: result.videoUrl,
          publishedAt: new Date(),
          youtubeVideoId: result.videoId,
          lastError: null,
          updatedAt: new Date(),
        })
        .where(eq(tubePost.id, row.id));

      results.push({ id: row.id, ok: true });
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      const retryable = err instanceof PublisherError ? err.retryable : true;
      const newAttempts = row.attempts + 1;
      const exhausted = newAttempts >= MAX_ATTEMPTS;
      const backoffMs = Math.min(
        30 * 60 * 1000,
        Math.pow(2, newAttempts) * 2 * 60 * 1000
      );
      const nextAt = new Date(Date.now() + backoffMs);

      await db
        .update(tubePost)
        .set({
          status: !retryable || exhausted ? "failed" : "scheduled",
          lastError: error.slice(0, 1000),
          nextAttemptAt: !retryable || exhausted ? null : nextAt,
          updatedAt: new Date(),
        })
        .where(eq(tubePost.id, row.id));

      results.push({ id: row.id, ok: false, error });
    }
  }

  return { processed: results.length, results };
}
