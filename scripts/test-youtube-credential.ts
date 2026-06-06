/**
 * SAFE, read-only credential test for the connected YouTube account.
 * Proves: decrypt stored token -> auto-refresh (it's stale) -> YouTube accepts it.
 * Does NOT upload or post anything.
 *   pnpm tsx scripts/test-youtube-credential.ts
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env.local" });
loadEnv();

async function main() {
  const { db } = await import("../src/lib/db");
  const { connection } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const { ensureFreshAccessToken } = await import("../src/lib/token-refresh");

  const [conn] = await db
    .select()
    .from(connection)
    .where(eq(connection.platform, "youtube"));
  if (!conn) {
    console.log("No YouTube connection found.");
    process.exit(1);
  }
  console.log("Connection:", conn.accountName);
  console.log("Stored expiry:", conn.accessTokenExpiresAt, "(stale = needs refresh)");
  console.log("needsReconnect (before):", conn.needsReconnect);

  let token: string;
  try {
    token = await ensureFreshAccessToken({
      id: conn.id,
      platform: conn.platform,
      accessToken: conn.accessToken,
      refreshToken: conn.refreshToken,
      accessTokenExpiresAt: conn.accessTokenExpiresAt,
      metadata: conn.metadata as Record<string, unknown> | null,
    });
    console.log("\n[1/2] Token refresh: OK — got a usable access token.");
  } catch (e) {
    console.log(
      "\n[1/2] Token refresh FAILED:",
      e instanceof Error ? e.message : String(e)
    );
    console.log(
      "=> The saved YouTube login is dead. You'll need to click 'Reconnect' on the Connections page before posting."
    );
    process.exit(0);
  }

  const res = await fetch(
    "https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true",
    { headers: { Authorization: `Bearer ${token}` } }
  );
  const j = await res.json();
  if (res.ok) {
    console.log(
      "[2/2] YouTube accepted the token. Channel:",
      j.items?.[0]?.snippet?.title ?? "(unknown)"
    );
    const [after] = await db
      .select()
      .from(connection)
      .where(eq(connection.id, conn.id));
    console.log("\nNew expiry (after refresh):", after.accessTokenExpiresAt);
    console.log("needsReconnect (after):", after.needsReconnect);
    console.log("\nRESULT: ✅ Your YouTube credential works. A real post will authenticate.");
  } else {
    console.log(
      "[2/2] YouTube REJECTED the token:",
      res.status,
      JSON.stringify(j).slice(0, 300)
    );
    console.log("\nRESULT: ⚠ Token refreshed but YouTube rejected it — likely a scope/permission issue; reconnect may be needed.");
  }
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
