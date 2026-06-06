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

import { eq } from "drizzle-orm";
import { db } from "../src/lib/db";
import { connection } from "../src/lib/db/schema";
import { encryptSecret, isEncrypted } from "../src/lib/crypto";

async function main(): Promise<void> {
  const rows = await db
    .select({
      id: connection.id,
      accessToken: connection.accessToken,
      refreshToken: connection.refreshToken,
    })
    .from(connection);

  let scanned = 0;
  let accessTokensEncrypted = 0;
  let refreshTokensEncrypted = 0;
  let skippedAlreadyEncrypted = 0;

  for (const row of rows) {
    scanned++;

    const update: { accessToken?: string; refreshToken?: string } = {};

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
    if (update.accessToken !== undefined || update.refreshToken !== undefined) {
      await db.update(connection).set(update).where(eq(connection.id, row.id));
    }
  }

  console.log("encrypt-existing-tokens: migration complete");
  console.log(`  rows scanned:                ${scanned}`);
  console.log(`  access tokens encrypted:     ${accessTokensEncrypted}`);
  console.log(`  refresh tokens encrypted:    ${refreshTokensEncrypted}`);
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
