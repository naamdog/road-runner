/**
 * Apply a drizzle-generated .sql migration file directly (non-interactive),
 * tolerating statements that were already applied (idempotent re-runs).
 *
 *   pnpm tsx scripts/apply-sql-migration.ts drizzle/0004_harden.sql
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

import { readFileSync } from "node:fs";
import postgres from "postgres";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: tsx scripts/apply-sql-migration.ts <path.sql>");
    process.exit(1);
  }
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL not set");

  const sql = postgres(url, { prepare: false, max: 1 });
  const statements = readFileSync(file, "utf8")
    .split("--> statement-breakpoint")
    .map((s) => s.trim())
    .filter(Boolean);

  let applied = 0;
  let skipped = 0;
  for (const stmt of statements) {
    const head = stmt.split("\n")[0].slice(0, 90);
    try {
      await sql.unsafe(stmt);
      applied++;
      console.log("OK   :", head);
    } catch (e: unknown) {
      const err = e as { message?: string; code?: string };
      const msg = String(err?.message ?? e);
      const exists =
        /already exists|duplicate/i.test(msg) ||
        ["42701", "42P07", "42710"].includes(err?.code ?? "");
      if (exists) {
        skipped++;
        console.log("skip :", head, "(already applied)");
      } else {
        console.error("FAIL :", head);
        throw e;
      }
    }
  }
  console.log(`\ndone: applied=${applied} skipped=${skipped}`);
  await sql.end();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
