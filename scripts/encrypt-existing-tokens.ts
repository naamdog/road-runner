/**
 * One-time, IDEMPOTENT migration: encrypt any plaintext tokens already stored
 * in the `connection` table.
 *
 * Older rows may hold OAuth access/refresh tokens as legacy plaintext. This
 * script scans every connection row and, for any token that is not already in
 * the "enc:v1:" wire format, encrypts it in place. Tokens that are already
 * encrypted are left untouched, so re-running this is a safe no-op.
 *
 * Usage:
 *   pnpm tsx scripts/encrypt-existing-tokens.ts
 *
 * Requires TOKEN_ENC_KEY (base64-encoded 32 bytes) + DATABASE_URL in the env
 * (loaded from .env.local / .env below).
 */

import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { encryptSecret, isEncrypted } from "../src/lib/crypto";

async function main(): Promise<void> {
  // Import the DB lazily — AFTER the loadEnv() calls above — because
  // src/lib/db reads DATABASE_URL at module-evaluation time and static imports
  // are hoisted above top-level statements.
  const { db } = await import("../src/lib/db");
  const { connection } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");

  const rows = await db
    .select({
      id: connection.id,
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken,
      metadata: connection.metadata,
    })
    .from(connection);

  let scanned = 0;
  let accessTokensEncrypted = 0;
  let refreshTokensEncrypted = 0;
  let skippedAlreadyEncrypted = 0;
  let metadataStripped = 0;

  for (const row of rows) {
    scanned++;

    const update: {
      accessToken?: string;
      refreshToken?: string;
      metadata?: Record<string, unknown>;
    } = {};

    // Purge any legacy plaintext Page token stored in metadata.pageAccessToken
    // (the real token now lives encrypted in the accessToken column).
    if (
      row.metadata &&
      typeof row.metadata === "object" &&
      "pageAccessToken" in (row.metadata as Record<string, unknown>)
    ) {
      const { pageAccessToken: _drop, ...rest } = row.metadata as Record<
        string,
        unknown
      >;
      void _drop;
      update.metadata = rest;
      metadataStripped++;
    }

    if (row.accessToken !== null) {
      if (isEncrypted(row.accessToken)) {
        skippedAlreadyEncrypted++;
      } else {
        update.accessToken = encryptSecret(row.accessToken);
        accessTokensEncrypted++;
      }
    }

    if (row.refreshToken !== null) {
      if (isEncrypted(row.refreshToken)) {
        skippedAlreadyEncrypted++;
      } else {
        update.refreshToken = encryptSecret(row.refreshToken);
        refreshTokensEncrypted++;
      }
    }

    // Only UPDATE rows that actually changed.
    if (
      update.accessToken !== undefined ||
      update.refreshToken !== undefined ||
      update.metadata !== undefined
    ) {
      await db.update(connection).set(update).where(eq(connection.id, row.id));
    }
  }

  console.log("encrypt-existing-tokens: migration complete");
  console.log(`  rows scanned:                ${scanned}`);
  console.log(`  access tokens encrypted:     ${accessTokensEncrypted}`);
  console.log(`  refresh tokens encrypted:    ${refreshTokensEncrypted}`);
  console.log(`  metadata pageAccessToken removed: ${metadataStripped}`);
  console.log(`  skipped (already encrypted): ${skippedAlreadyEncrypted}`);
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("encrypt-existing-tokens: migration failed");
    console.error(err);
    process.exit(1);
  });
