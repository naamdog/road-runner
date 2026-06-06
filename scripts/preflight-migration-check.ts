/**
 * Read-only preflight for migration 0004. Confirms existing data won't be
 * rejected by the new unique indexes, and reports how many tokens still need
 * encrypting. Safe to run anytime.
 *
 *   pnpm tsx scripts/preflight-migration-check.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import postgres from "postgres";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");
  const sql = postgres(url, { prepare: false, max: 1 });

  const dupTargets = await sql`
    SELECT post_id, connection_id, count(*) AS c
    FROM post_target WHERE connection_id IS NOT NULL
    GROUP BY 1, 2 HAVING count(*) > 1`;
  const dupDefaults = await sql`
    SELECT user_id, count(*) AS c
    FROM brand WHERE is_default GROUP BY 1 HAVING count(*) > 1`;
  const [{ c: conns }] = await sql`SELECT count(*) AS c FROM connection`;
  const [{ c: plaintext }] = await sql`
    SELECT count(*) AS c FROM connection
    WHERE access_token IS NOT NULL AND access_token NOT LIKE 'enc:v1:%'`;
  const [{ c: metaTokens }] = await sql`
    SELECT count(*) AS c FROM connection
    WHERE metadata->>'pageAccessToken' IS NOT NULL`;

  console.log("=== preflight migration check ===");
  console.log("duplicate (post_id, connection_id) groups:", dupTargets.length);
  console.log("users with >1 default brand:           ", dupDefaults.length);
  console.log("connections total:                     ", conns);
  console.log("plaintext access tokens to encrypt:    ", plaintext);
  console.log("metadata rows with pageAccessToken:    ", metaTokens);

  await sql.end();
  if (dupTargets.length || dupDefaults.length) {
    console.error("\nBLOCKED: dedupe the above before applying migration 0004.");
    process.exit(2);
  }
  console.log("\nOK: safe to apply migration 0004.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
