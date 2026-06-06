import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connection } from "@/lib/db/schema";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  const { id } = await params;

  const [conn] = await db
    .select({
      platform: connection.platform,
      accountName: connection.accountName,
      accessTokenExpiresAt: connection.accessTokenExpiresAt,
      needsReconnect: connection.needsReconnect,
      lastRefreshedAt: connection.lastRefreshedAt,
      lastRefreshError: connection.lastRefreshError,
    })
    .from(connection)
    .where(and(eq(connection.id, id), eq(connection.userId, session.user.id)));

  if (!conn) {
    return NextResponse.json({ error: "Account not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: !conn.needsReconnect,
    needsReconnect: conn.needsReconnect,
    platform: conn.platform,
    accountName: conn.accountName,
    expiresAt: conn.accessTokenExpiresAt,
    lastRefreshedAt: conn.lastRefreshedAt,
    lastRefreshError: conn.lastRefreshError,
  });
}
