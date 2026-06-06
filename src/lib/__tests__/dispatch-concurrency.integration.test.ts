/**
 * REAL-DB integration test for the cron dispatcher's single-claim guarantee.
 *
 * WHY THIS EXISTS
 * ---------------
 * The dispatcher claims due rows with `SELECT ... FOR UPDATE SKIP LOCKED` inside a
 * transaction and flips them to `publishing` (incrementing `attempts`) in the same
 * tx. Two overlapping Vercel Cron invocations must therefore NEVER claim the same
 * row — i.e. no double publish. This test seeds two due `post_target` rows, fires
 * two GET handlers concurrently, and asserts each row's `attempts` went up by AT
 * MOST one (exactly-once claim). The publishes themselves are EXPECTED to fail
 * (no real platform tokens) — that's fine; we assert on claim accounting, not on
 * publish success.
 *
 * HOW TO RUN
 * ----------
 * This test is SKIPPED unless TEST_DATABASE_URL is set, so the normal `pnpm test`
 * run never needs a database. To run it against a disposable Postgres:
 *
 *   1. Spin up a throwaway DB, e.g.:
 *        docker run --rm -e POSTGRES_PASSWORD=pw -p 5433:5432 postgres:16
 *   2. Apply the schema/migrations to it (drizzle migrations in ./drizzle), e.g.:
 *        $env:DATABASE_URL = "postgres://postgres:pw@localhost:5433/postgres"
 *        pnpm exec drizzle-kit push
 *   3. Point the test at it and run just this file:
 *        $env:TEST_DATABASE_URL = "postgres://postgres:pw@localhost:5433/postgres"
 *        pnpm exec vitest run src/lib/__tests__/dispatch-concurrency.integration.test.ts
 *
 * Optionally set CRON_SECRET to also exercise the auth header path; the test reads
 * it and sends `Authorization: Bearer <CRON_SECRET>` when present.
 *
 * The test cleans up everything it seeds (cascading delete on the throwaway user).
 */
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";
import { nanoid } from "nanoid";

const TEST_DB = process.env.TEST_DATABASE_URL;

// Loaded lazily inside beforeAll, AFTER env is configured, so `@/lib/db` binds its
// postgres client to TEST_DATABASE_URL and the route + the seed code share it.
let db: typeof import("@/lib/db").db;
let schema: typeof import("@/lib/db").schema;
let GET: typeof import("@/app/api/cron/dispatch/route").GET;
let eq: typeof import("drizzle-orm").eq;
let inArray: typeof import("drizzle-orm").inArray;

// IDs we create, for assertions + teardown.
const userId = `test_user_${nanoid()}`;
const brandId = `test_brand_${nanoid()}`;
const connectionId = `test_conn_${nanoid()}`;
const mediaId = `test_media_${nanoid()}`;
const postId = `test_post_${nanoid()}`;
const targetIds = [`test_tgt_${nanoid()}`, `test_tgt_${nanoid()}`];

/** Build a GET Request, attaching the CRON_SECRET bearer header if configured. */
function cronRequest(NextRequest: typeof import("next/server").NextRequest) {
  const headers: Record<string, string> = {};
  if (process.env.CRON_SECRET) {
    headers.authorization = `Bearer ${process.env.CRON_SECRET}`;
  }
  return new NextRequest("http://localhost/api/cron/dispatch", { headers });
}

describe.skipIf(!TEST_DB)("dispatch concurrency (real DB)", () => {
  beforeAll(async () => {
    // Point the app at the disposable DB and satisfy getConfig()'s required set so
    // the route's import chain (config -> crypto -> token-refresh) doesn't throw.
    process.env.DATABASE_URL = TEST_DB as string;
    process.env.TOKEN_ENC_KEY ??= Buffer.alloc(32, 7).toString("base64");
    process.env.BETTER_AUTH_SECRET ??=
      "test-better-auth-secret-at-least-32-chars-long";
    process.env.NEXT_PUBLIC_APP_URL ??= "http://localhost:3000";
    process.env.GOOGLE_CLIENT_ID ??= "dummy-google-client-id";
    process.env.GOOGLE_CLIENT_SECRET ??= "dummy-google-client-secret";
    process.env.META_CLIENT_ID ??= "dummy-meta-client-id";
    process.env.META_CLIENT_SECRET ??= "dummy-meta-client-secret";

    const dbMod = await import("@/lib/db");
    db = dbMod.db;
    schema = dbMod.schema;
    const drizzleMod = await import("drizzle-orm");
    eq = drizzleMod.eq;
    inArray = drizzleMod.inArray;
    GET = (await import("@/app/api/cron/dispatch/route")).GET;

    const now = new Date();
    const past = new Date(now.getTime() - 60_000); // due 1 min ago

    await db.insert(schema.user).values({
      id: userId,
      name: "Concurrency Test User",
      email: `${userId}@example.test`,
    });
    await db.insert(schema.brand).values({
      id: brandId,
      userId,
      name: "Test Brand",
    });
    await db.insert(schema.connection).values({
      id: connectionId,
      userId,
      brandId,
      platform: "youtube",
      accountId: "test-account",
      accountName: "Test Channel",
      // No real tokens — publishes will fail, which is fine for this assertion.
      accessToken: "enc:v1:invalid-but-present",
      refreshToken: null,
      accessTokenExpiresAt: null,
    });
    await db.insert(schema.media).values({
      id: mediaId,
      userId,
      blobUrl: "https://example.test/video.mp4",
      blobPath: "test/video.mp4",
      filename: "video.mp4",
      contentType: "video/mp4",
      sizeBytes: 1024,
    });
    await db.insert(schema.post).values({
      id: postId,
      userId,
      brandId,
      mediaId,
      caption: "concurrency test",
    });
    // Two DUE targets. Note: the (postId, connectionId) unique index means both
    // targets can't share the same connection — give the second a NULL connection
    // (still claimable; it just fails publish with "No account for this target").
    await db.insert(schema.postTarget).values([
      {
        id: targetIds[0],
        postId,
        userId,
        connectionId,
        platform: "youtube",
        scheduledAt: past,
        status: "scheduled",
        attempts: 0,
      },
      {
        id: targetIds[1],
        postId,
        userId,
        connectionId: null,
        platform: "youtube",
        scheduledAt: past,
        status: "scheduled",
        attempts: 0,
      },
    ]);
  });

  afterAll(async () => {
    if (!db) return;
    // Cascades to brand/connection/media/post/post_target via FK onDelete.
    await db.delete(schema.user).where(eq(schema.user.id, userId));
  });

  it("two simultaneous cron invocations never double-claim a row", async () => {
    const { NextRequest } = await import("next/server");

    // Fire both invocations concurrently. Publishes are expected to error; we only
    // care that the claim accounting stays exactly-once.
    const [resA, resB] = await Promise.all([
      GET(cronRequest(NextRequest)),
      GET(cronRequest(NextRequest)),
    ]);

    // Both requests should be authorized and return 200 (auth header matched, or
    // no CRON_SECRET configured).
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    const rows = await db
      .select({
        id: schema.postTarget.id,
        attempts: schema.postTarget.attempts,
        status: schema.postTarget.status,
      })
      .from(schema.postTarget)
      .where(inArray(schema.postTarget.id, targetIds));

    expect(rows).toHaveLength(2);

    for (const row of rows) {
      // The core single-claim invariant: a row is claimed by AT MOST one of the
      // two concurrent runs, so attempts went from 0 to at most 1. A value of 2
      // would mean both invocations claimed (= double publish risk).
      expect(row.attempts).toBeLessThanOrEqual(1);
      // Each due row should be claimed exactly once across the two runs.
      expect(row.attempts).toBe(1);
      // After a claim it is no longer "scheduled+publishing" simultaneously: it
      // ends terminal/failed or rescheduled, never stuck mid-claim by two runs.
      expect(["failed", "scheduled", "published", "publishing"]).toContain(
        row.status
      );
    }

    // Total claims across both rows must equal the number of due rows (2): every
    // row claimed once, none claimed twice, none skipped.
    const totalAttempts = rows.reduce((sum, r) => sum + r.attempts, 0);
    expect(totalAttempts).toBe(2);
  });
});
