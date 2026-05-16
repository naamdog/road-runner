import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connection } from "@/lib/db/schema";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

/**
 * List the YouTube playlists owned by the connected account.
 * Used by the TubeRunner compose form to populate the playlist dropdown.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ connectionId: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  const { connectionId } = await params;

  const [conn] = await db
    .select({
      accessToken: connection.accessToken,
      platform: connection.platform,
    })
    .from(connection)
    .where(
      and(eq(connection.id, connectionId), eq(connection.userId, session.user.id))
    );
  if (!conn || conn.platform !== "youtube" || !conn.accessToken) {
    return NextResponse.json(
      { error: "YouTube account not found" },
      { status: 404 }
    );
  }

  try {
    const playlists: { id: string; title: string; count: number }[] = [];
    let pageToken: string | undefined = undefined;
    do {
      const url = new URL(
        "https://www.googleapis.com/youtube/v3/playlists"
      );
      url.searchParams.set("part", "snippet,contentDetails");
      url.searchParams.set("mine", "true");
      url.searchParams.set("maxResults", "50");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${conn.accessToken}` },
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: `YouTube returned ${res.status}` },
          { status: 502 }
        );
      }
      const j = (await res.json()) as {
        items?: Array<{
          id: string;
          snippet?: { title?: string };
          contentDetails?: { itemCount?: number };
        }>;
        nextPageToken?: string;
      };
      for (const it of j.items || []) {
        playlists.push({
          id: it.id,
          title: it.snippet?.title || "Untitled playlist",
          count: it.contentDetails?.itemCount ?? 0,
        });
      }
      pageToken = j.nextPageToken;
    } while (pageToken && playlists.length < 200);

    return NextResponse.json({ playlists });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Fetch failed" },
      { status: 500 }
    );
  }
}
