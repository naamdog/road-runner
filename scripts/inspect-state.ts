/**
 * Read-only snapshot of the live data: what's connected, what's scheduled.
 *   pnpm tsx scripts/inspect-state.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();
import postgres from "postgres";

async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { prepare: false, max: 1 });
  console.log("NEXT_PUBLIC_APP_URL:", process.env.NEXT_PUBLIC_APP_URL);
  console.log("BETTER_AUTH_URL:    ", process.env.BETTER_AUTH_URL);
  console.log("");

  const users = await sql`SELECT count(*) AS c FROM "user"`;
  console.log("users:", users[0].c);

  const conns = await sql`
    SELECT platform, account_name, account_handle, is_active, needs_reconnect,
           access_token_expires_at,
           (access_token LIKE 'enc:v1:%') AS token_encrypted,
           (metadata::text) AS metadata
    FROM connection ORDER BY platform`;
  console.log("\nconnections:", conns.length);
  for (const c of conns) {
    console.log(
      `  - ${c.platform} | ${c.account_name} (${c.account_handle ?? "-"}) | active=${c.is_active} | needsReconnect=${c.needs_reconnect} | encrypted=${c.token_encrypted} | expires=${c.access_token_expires_at ?? "never"}`
    );
    console.log(`      metadata: ${c.metadata}`);
  }

  const media = await sql`SELECT count(*) AS c FROM media`;
  const posts = await sql`SELECT count(*) AS c FROM post`;
  const targets = await sql`SELECT status, count(*) AS c FROM post_target GROUP BY status`;
  const tube = await sql`SELECT status, count(*) AS c FROM tube_post GROUP BY status`;
  console.log("\nmedia uploaded:", media[0].c);
  console.log("posts:", posts[0].c);
  console.log("post_target by status:", targets.map((t) => `${t.status}=${t.c}`).join(", ") || "none");
  console.log("tube_post by status:", tube.map((t) => `${t.status}=${t.c}`).join(", ") || "none");

  await sql.end();
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
