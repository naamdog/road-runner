import { NextRequest, NextResponse } from "next/server";
import { and, eq, lte, or, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { postTarget, post, media, connection } from "@/lib/db/schema";
import { publishers, PublisherError } from "@/lib/publishers";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min per cron invocation

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 10;

/**
 * Cron dispatcher — runs every minute via Vercel Cron.
 *
 * Selects post_target rows whose scheduledAt has passed and status is 'scheduled',
 * marks them as 'publishing', attempts to publish via the platform publisher,
 * and persists the result.
 *
 * Failures are retried up to MAX_ATTEMPTS with exponential backoff.
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

  // Lock + claim a batch
  const due = await db
    .select({
      id: postTarget.id,
      platform: postTarget.platform,
      connectionId: postTarget.connectionId,
      attempts: postTarget.attempts,
      postId: postTarget.postId,
      userId: postTarget.userId,
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
    // Mark as publishing (best-effort lock)
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
        throw new PublisherError(
          "No connection for this platform",
          false
        );
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
        throw new PublisherError("Post has no media attached", false);
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
        throw new PublisherError("Connection missing access token", false);
      }

      const result = await publishers[row.platform]({
        videoUrl: p.videoUrl,
        caption: p.caption,
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
      const error =
        err instanceof Error ? err.message : "Unknown publish error";
      const retryable =
        err instanceof PublisherError ? err.retryable : true;
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

  return NextResponse.json({
    processed: results.length,
    results,
    at: now.toISOString(),
  });
}
