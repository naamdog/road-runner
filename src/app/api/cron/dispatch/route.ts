import { NextRequest, NextResponse } from "next/server";
import { and, eq, lte, or, isNull, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { postTarget, post, media, connection, tubePost } from "@/lib/db/schema";
import { publishers, PublisherError } from "@/lib/publishers";
import { publishYouTubeLongform } from "@/lib/publishers/youtube-longform";
import { ensureFreshAccessToken } from "@/lib/token-refresh";
import { decryptSecret } from "@/lib/crypto";
import { getConfig } from "@/lib/config";
import { createLogger } from "@/lib/logger";
import {
  nextAttemptAt,
  SHORT_BASE_MS,
  SHORT_CAP_MS,
  TUBE_BASE_MS,
  TUBE_CAP_MS,
} from "@/lib/backoff";

export const runtime = "nodejs";
export const maxDuration = 300; // 5 min per cron invocation

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 10;
// A row claimed (status='publishing') but never finalized within this window is
// considered orphaned (the run was killed/timed out after claim) and reset to
// 'scheduled' so a later run retries it. Must exceed maxDuration + the longest
// upload timeout so we never reap a row that is still legitimately uploading.
const STALE_PUBLISHING_MS = 15 * 60 * 1000;

const log = createLogger({ scope: "cron" });

/** Retry a DB write a few times to ride out transient pool/connection blips. */
async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

/**
 * Reset rows orphaned in 'publishing' (claimed but never finalized — e.g. the
 * serverless function hit maxDuration or crashed mid-batch). `attempts` was
 * already incremented at claim time, so MAX_ATTEMPTS is still respected.
 *
 * NOTE: this makes delivery at-least-once. If a publish actually succeeded on
 * the platform but the status write never landed, a reaped row could publish
 * again. The finalize path below retries its status write specifically to keep
 * that window vanishingly small; true exactly-once would need per-platform
 * idempotency keys (future work).
 */
async function reapStale(now: Date) {
  const cutoff = new Date(now.getTime() - STALE_PUBLISHING_MS);
  const note =
    "Reset after being stuck in 'publishing' (the previous run was likely killed or timed out).";

  const short = await db
    .update(postTarget)
    .set({ status: "scheduled", nextAttemptAt: now, lastError: note, updatedAt: now })
    .where(and(eq(postTarget.status, "publishing"), lte(postTarget.lastAttemptAt, cutoff)))
    .returning({ id: postTarget.id });

  const tube = await db
    .update(tubePost)
    .set({ status: "scheduled", nextAttemptAt: now, lastError: note, updatedAt: now })
    .where(and(eq(tubePost.status, "publishing"), lte(tubePost.lastAttemptAt, cutoff)))
    .returning({ id: tubePost.id });

  if (short.length || tube.length) {
    log.warn(
      { shortReset: short.length, tubeReset: tube.length },
      "reaped stale 'publishing' rows"
    );
  }
  return { short: short.length, tube: tube.length };
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

  // Fail the whole run loudly (and visibly, as a 500 in Vercel's cron log) if the
  // environment is misconfigured — e.g. a missing/rotated TOKEN_ENC_KEY. Without
  // this, config validation first fires deep inside per-row token decryption and
  // surfaces only as generic per-post failures.
  try {
    getConfig();
  } catch (err) {
    log.error(
      { err: err instanceof Error ? err.message : String(err) },
      "CONFIG INVALID — fix TOKEN_ENC_KEY / env vars; aborting cron run"
    );
    return NextResponse.json({ error: "config-invalid" }, { status: 500 });
  }

  const now = new Date();

  // Each stage is isolated: a throw in one (e.g. a DB blip in a claim tx) must
  // not 500 the whole invocation or skip the stages after it.
  const emptyStage = {
    processed: 0,
    counts: { succeeded: 0, retried: 0, failed: 0 },
    results: [] as Array<{ id: string; ok: boolean; error?: string }>,
  };

  let reaped = { short: 0, tube: 0 };
  try {
    reaped = await reapStale(now);
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, "reapStale failed");
  }

  let shortResults: Awaited<ReturnType<typeof processShortForm>> = emptyStage;
  try {
    shortResults = await processShortForm(now);
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, "processShortForm failed");
  }

  let tubeResults: Awaited<ReturnType<typeof processTubeRunner>> = emptyStage;
  try {
    tubeResults = await processTubeRunner(now);
  } catch (err) {
    log.error({ err: err instanceof Error ? err.message : String(err) }, "processTubeRunner failed");
  }

  log.info(
    {
      reaped,
      short: { processed: shortResults.processed, ...shortResults.counts },
      tube: { processed: tubeResults.processed, ...tubeResults.counts },
    },
    "cron dispatch complete"
  );

  return NextResponse.json({
    reaped,
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

      // Publish SUCCEEDED on the platform. Finalize with retry — a DB blip here
      // must NOT fall through to the reschedule path below (that would publish a
      // duplicate). On persistent finalize failure, mark failed-with-note so the
      // reaper won't re-publish.
      try {
        await withRetry(() =>
          db
            .update(postTarget)
            .set({
              status: "published",
              publishedUrl: result.publishedUrl,
              publishedAt: new Date(),
              lastError: null,
              updatedAt: new Date(),
            })
            .where(eq(postTarget.id, row.id))
        );
        counts.succeeded++;
        results.push({ id: row.id, ok: true });
        log.info(
          { targetId: row.id, platform: row.platform, attempt: row.attempts + 1 },
          "short-form publish ok"
        );
      } catch (finalizeErr) {
        const fmsg =
          finalizeErr instanceof Error ? finalizeErr.message : String(finalizeErr);
        log.error(
          { targetId: row.id, platform: row.platform, publishedUrl: result.publishedUrl, err: fmsg },
          "published on platform but failed to record status — preventing a duplicate"
        );
        try {
          await db
            .update(postTarget)
            .set({
              status: "failed",
              publishedUrl: result.publishedUrl,
              lastError: `Published on the platform, but recording it failed (no duplicate will be posted). ${fmsg}`.slice(0, 1000),
              updatedAt: new Date(),
            })
            .where(eq(postTarget.id, row.id));
        } catch {
          // DB unavailable; the stale-publishing reaper is the last resort.
        }
        counts.succeeded++;
        results.push({ id: row.id, ok: true, error: "status-write-failed" });
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      const retryable = err instanceof PublisherError ? err.retryable : true;
      const newAttempts = row.attempts + 1;
      const exhausted = newAttempts >= MAX_ATTEMPTS;
      const terminal = !retryable || exhausted;

      // Wrap the failure-recording write (mirroring the finalize path): if this
      // single update throws, it must not abort the whole batch and leave the
      // other claimed rows stranded in 'publishing'. The reaper recovers the row.
      try {
        await withRetry(() =>
          db
            .update(postTarget)
            .set({
              status: terminal ? "failed" : "scheduled",
              lastError: error.slice(0, 1000),
              nextAttemptAt: terminal
                ? null
                : nextAttemptAt(SHORT_BASE_MS, SHORT_CAP_MS, newAttempts),
              updatedAt: new Date(),
            })
            .where(eq(postTarget.id, row.id))
        );
      } catch (writeErr) {
        log.error(
          {
            targetId: row.id,
            err: writeErr instanceof Error ? writeErr.message : String(writeErr),
          },
          "failed to record short-form failure status; reaper will recover the row"
        );
      }

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

      // Surface non-fatal "published but degraded" outcomes — the playlist add
      // or custom thumbnail silently failed — so the operator isn't left
      // believing everything worked. Status stays "published"; the note rides on
      // lastError (the tube list shows it for published rows too).
      const degraded: string[] = [];
      if (row.playlistId && result.addedToPlaylist === false) {
        degraded.push("adding to the playlist failed");
      }
      if (row.thumbnailUrl && result.thumbnailSet === false) {
        degraded.push(
          "the custom thumbnail was not set (the channel may need verification)"
        );
      }
      const publishNote = degraded.length
        ? `Published, but ${degraded.join(" and ")}. Fix it manually on YouTube.`
        : null;

      // Publish SUCCEEDED — finalize with retry; a DB blip must not reschedule
      // (that would re-upload a duplicate video). On persistent failure, mark
      // failed-with-note so the reaper won't re-publish.
      try {
        await withRetry(() =>
          db
            .update(tubePost)
            .set({
              status: "published",
              publishedUrl: result.videoUrl,
              publishedAt: new Date(),
              youtubeVideoId: result.videoId,
              lastError: publishNote,
              updatedAt: new Date(),
            })
            .where(eq(tubePost.id, row.id))
        );
      } catch (finalizeErr) {
        const fmsg =
          finalizeErr instanceof Error ? finalizeErr.message : String(finalizeErr);
        log.error(
          { tubePostId: row.id, publishedUrl: result.videoUrl, err: fmsg },
          "uploaded to YouTube but failed to record status — preventing a duplicate"
        );
        try {
          await db
            .update(tubePost)
            .set({
              status: "failed",
              publishedUrl: result.videoUrl,
              youtubeVideoId: result.videoId,
              lastError: `Uploaded to YouTube, but recording it failed (no duplicate will be posted). ${fmsg}`.slice(0, 1000),
              updatedAt: new Date(),
            })
            .where(eq(tubePost.id, row.id));
        } catch {
          // DB unavailable; the stale-publishing reaper is the last resort.
        }
        counts.succeeded++;
        results.push({ id: row.id, ok: true, error: "status-write-failed" });
        log.info(
          { tubePostId: row.id, attempt: row.attempts + 1 },
          "tube publish ok (status write degraded)"
        );
        continue;
      }

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

      // Wrap the failure-recording write so one row's DB blip can't abort the
      // batch and strand other claimed rows in 'publishing' (the reaper recovers).
      try {
        await withRetry(() =>
          db
            .update(tubePost)
            .set({
              status: terminal ? "failed" : "scheduled",
              lastError: error.slice(0, 1000),
              nextAttemptAt: terminal
                ? null
                : nextAttemptAt(TUBE_BASE_MS, TUBE_CAP_MS, newAttempts),
              updatedAt: new Date(),
            })
            .where(eq(tubePost.id, row.id))
        );
      } catch (writeErr) {
        log.error(
          {
            tubePostId: row.id,
            err: writeErr instanceof Error ? writeErr.message : String(writeErr),
          },
          "failed to record tube failure status; reaper will recover the row"
        );
      }

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
