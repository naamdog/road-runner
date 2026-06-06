import { NextRequest, NextResponse } from "next/server";
import { and, eq, lte, or, isNull, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { postTarget, post, media, connection, tubePost } from "@/lib/db/schema";
import { publishers, PublisherError } from "@/lib/publishers";
import { publishYouTubeLongform } from "@/lib/publishers/youtube-longform";
import { ensureFreshAccessToken } from "@/lib/token-refresh";
import { decryptSecret } from "@/lib/crypto";
import { createLogger } from "@/lib/logger";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min per cron invocation

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 10;

// Backoff: capped exponential with ±30% jitter to avoid a thundering herd when
// many targets fail at the same instant. Short-form and TubeRunner keep their
// distinct caps (15 min vs 30 min) for parity with historical behavior.
const SHORT_BASE_MS = 60 * 1000;
const SHORT_CAP_MS = 15 * 60 * 1000;
const TUBE_BASE_MS = 2 * 60 * 1000;
const TUBE_CAP_MS = 30 * 60 * 1000;

const log = createLogger({ scope: "cron" });

function nextAttemptAt(baseMs: number, capMs: number, attempts: number): Date {
  const raw = Math.min(capMs, Math.pow(2, attempts) * baseMs);
  const jitter = raw * 0.3 * (Math.random() * 2 - 1); // ±30%
  return new Date(Date.now() + Math.max(1000, Math.round(raw + jitter)));
}

/**
 * Cron dispatcher — runs every minute via Vercel Cron.
 *
 * Picks up two kinds of due work:
 *   1. `post_target` rows (short-form, multi-platform fan-out)
 *   2. `tube_post` rows (long-form YouTube uploads)
 *
 * Claiming is done inside a transaction with `SELECT ... FOR UPDATE SKIP LOCKED`
 * so two overlapping cron invocations can never claim the same row (no double
 * publish). The slow publish itself happens AFTER the claim transaction commits,
 * so platform API latency never holds a row lock. Tokens are decrypted and
 * refreshed (if near expiry) immediately before each publish.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const now = new Date();
  const shortResults = await processShortForm(now);
  const tubeResults = await processTubeRunner(now);

  log.info(
    {
      short: { processed: shortResults.processed, ...shortResults.counts },
      tube: { processed: tubeResults.processed, ...tubeResults.counts },
    },
    "cron dispatch complete"
  );

  return NextResponse.json({
    short: shortResults,
    tube: tubeResults,
    at: now.toISOString(),
  });
}

type ClaimedTarget = {
  id: string;
  platform: "youtube" | "instagram" | "tiktok" | "linkedin" | "facebook";
  connectionId: string | null;
  attempts: number;
  postId: string;
  userId: string;
  targetCaption: string | null;
};

/**
 * Atomically claim up to BATCH_SIZE due targets: lock the rows (skipping any a
 * concurrent run already holds), flip them to `publishing`, and return them.
 */
async function claimShortForm(now: Date): Promise<ClaimedTarget[]> {
  return db.transaction(async (tx) => {
    const due = (await tx
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
          or(isNull(postTarget.nextAttemptAt), lte(postTarget.nextAttemptAt, now))
        )
      )
      .orderBy(sql`${postTarget.scheduledAt} ASC`)
      .limit(BATCH_SIZE)
      .for("update", { skipLocked: true })) as ClaimedTarget[];

    if (due.length === 0) return [];

    await tx
      .update(postTarget)
      .set({
        status: "publishing",
        lastAttemptAt: now,
        attempts: sql`${postTarget.attempts} + 1`,
        updatedAt: now,
      })
      .where(
        inArray(
          postTarget.id,
          due.map((r) => r.id)
        )
      );

    return due;
  });
}

async function processShortForm(now: Date) {
  const due = await claimShortForm(now);
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  const counts = { succeeded: 0, retried: 0, failed: 0 };

  for (const row of due) {
    try {
      if (!row.connectionId) {
        throw new PublisherError("No account for this target", false);
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
          id: connection.id,
          platform: connection.platform,
          accessToken: connection.accessToken,
          refreshToken: connection.refreshToken,
          accessTokenExpiresAt: connection.accessTokenExpiresAt,
          metadata: connection.metadata,
          accountId: connection.accountId,
          accountName: connection.accountName,
        })
        .from(connection)
        .where(eq(connection.id, row.connectionId));

      if (!conn) {
        throw new PublisherError("Account no longer exists", false);
      }

      // Decrypt + refresh-if-needed. Throws a non-retryable error if the
      // connection must be reconnected (token expired with no usable refresh).
      const accessToken = await ensureFreshAccessToken({
        id: conn.id,
        platform: conn.platform,
        accessToken: conn.accessToken,
        refreshToken: conn.refreshToken,
        accessTokenExpiresAt: conn.accessTokenExpiresAt,
        metadata: conn.metadata as Record<string, unknown> | null,
      });

      const result = await publishers[row.platform]({
        videoUrl: p.videoUrl,
        caption: row.targetCaption ?? p.caption,
        title: p.title,
        durationMs: p.durationMs,
        contentType: p.contentType,
        accessToken,
        refreshToken: decryptSecret(conn.refreshToken),
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

      counts.succeeded++;
      results.push({ id: row.id, ok: true });
      log.info(
        { targetId: row.id, platform: row.platform, attempt: row.attempts + 1 },
        "short-form publish ok"
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      const retryable = err instanceof PublisherError ? err.retryable : true;
      const newAttempts = row.attempts + 1;
      const exhausted = newAttempts >= MAX_ATTEMPTS;
      const terminal = !retryable || exhausted;

      await db
        .update(postTarget)
        .set({
          status: terminal ? "failed" : "scheduled",
          lastError: error.slice(0, 1000),
          nextAttemptAt: terminal
            ? null
            : nextAttemptAt(SHORT_BASE_MS, SHORT_CAP_MS, newAttempts),
          updatedAt: new Date(),
        })
        .where(eq(postTarget.id, row.id));

      if (terminal) counts.failed++;
      else counts.retried++;
      results.push({ id: row.id, ok: false, error });
      log.warn(
        {
          targetId: row.id,
          platform: row.platform,
          attempt: newAttempts,
          retryable,
          terminal,
          err: error.slice(0, 300),
        },
        "short-form publish failed"
      );
    }
  }

  return { processed: results.length, counts, results };
}

type ClaimedTube = {
  id: string;
  attempts: number;
  connectionId: string | null;
  mediaId: string | null;
  thumbnailUrl: string | null;
  title: string;
  description: string;
  tags: string[] | null;
  categoryId: string;
  visibility: string;
  madeForKids: boolean;
  playlistId: string | null;
};

async function claimTube(now: Date): Promise<ClaimedTube[]> {
  return db.transaction(async (tx) => {
    const due = (await tx
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
        playlistId: tubePost.playlistId,
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
      .limit(BATCH_SIZE)
      .for("update", { skipLocked: true })) as ClaimedTube[];

    if (due.length === 0) return [];

    await tx
      .update(tubePost)
      .set({
        status: "publishing",
        lastAttemptAt: now,
        attempts: sql`${tubePost.attempts} + 1`,
        updatedAt: now,
      })
      .where(
        inArray(
          tubePost.id,
          due.map((r) => r.id)
        )
      );

    return due;
  });
}

async function processTubeRunner(now: Date) {
  const due = await claimTube(now);
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  const counts = { succeeded: 0, retried: 0, failed: 0 };

  for (const row of due) {
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
        .select({
          id: connection.id,
          platform: connection.platform,
          accessToken: connection.accessToken,
          refreshToken: connection.refreshToken,
          accessTokenExpiresAt: connection.accessTokenExpiresAt,
          metadata: connection.metadata,
        })
        .from(connection)
        .where(eq(connection.id, row.connectionId));
      if (!conn) {
        throw new PublisherError("YouTube account no longer exists", false);
      }

      const accessToken = await ensureFreshAccessToken({
        id: conn.id,
        platform: conn.platform,
        accessToken: conn.accessToken,
        refreshToken: conn.refreshToken,
        accessTokenExpiresAt: conn.accessTokenExpiresAt,
        metadata: conn.metadata as Record<string, unknown> | null,
      });

      const result = await publishYouTubeLongform({
        accessToken,
        videoUrl: m.url,
        title: row.title,
        description: row.description,
        tags: row.tags ?? [],
        categoryId: row.categoryId,
        visibility: row.visibility as "public" | "unlisted" | "private",
        madeForKids: row.madeForKids,
        thumbnailUrl: row.thumbnailUrl,
        playlistId: row.playlistId,
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

      counts.succeeded++;
      results.push({ id: row.id, ok: true });
      log.info(
        { tubePostId: row.id, attempt: row.attempts + 1 },
        "tube publish ok"
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      const retryable = err instanceof PublisherError ? err.retryable : true;
      const newAttempts = row.attempts + 1;
      const exhausted = newAttempts >= MAX_ATTEMPTS;
      const terminal = !retryable || exhausted;

      await db
        .update(tubePost)
        .set({
          status: terminal ? "failed" : "scheduled",
          lastError: error.slice(0, 1000),
          nextAttemptAt: terminal
            ? null
            : nextAttemptAt(TUBE_BASE_MS, TUBE_CAP_MS, newAttempts),
          updatedAt: new Date(),
        })
        .where(eq(tubePost.id, row.id));

      if (terminal) counts.failed++;
      else counts.retried++;
      results.push({ id: row.id, ok: false, error });
      log.warn(
        {
          tubePostId: row.id,
          attempt: newAttempts,
          retryable,
          terminal,
          err: error.slice(0, 300),
        },
        "tube publish failed"
      );
    }
  }

  return { processed: results.length, counts, results };
}
