import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE, verifyToken } from "@/lib/gate";

export const runtime = "nodejs";

/**
 * Media proxy.
 *
 * Blotato serves clips as `application/octet-stream`, which breaks the browser
 * three ways: no thumbnail, a download prompt instead of playback, and
 * `preload="metadata"` degrading into a full-file download (a 150MB clip per
 * row froze the tab outright).
 *
 * This re-serves the same bytes with `video/mp4` and forwards Range requests,
 * so the browser fetches only the header it needs to paint a frame and streams
 * the rest on demand.
 */
const ALLOWED_HOST = "database.blotato.io";

export async function GET(req: NextRequest) {
  // Same gate as the rest of the app — don't turn this into an open relay.
  const jar = await cookies();
  if (!verifyToken(jar.get(COOKIE)?.value)) {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const raw = req.nextUrl.searchParams.get("u");
  if (!raw) return new NextResponse("Missing u", { status: 400 });

  let target: URL;
  try {
    target = new URL(raw);
  } catch {
    return new NextResponse("Bad url", { status: 400 });
  }
  // Restrict to Blotato's storage so this can't be used to fetch arbitrary hosts.
  if (target.protocol !== "https:" || target.hostname !== ALLOWED_HOST) {
    return new NextResponse("Forbidden host", { status: 403 });
  }

  const range = req.headers.get("range");
  const upstream = await fetch(target.toString(), {
    headers: range ? { Range: range } : undefined,
    cache: "no-store",
  });

  if (!upstream.ok && upstream.status !== 206) {
    return new NextResponse("Upstream error", { status: upstream.status });
  }

  const headers = new Headers();
  headers.set("Content-Type", "video/mp4"); // the whole point
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, max-age=3600");
  for (const h of ["content-length", "content-range", "etag", "last-modified"]) {
    const v = upstream.headers.get(h);
    if (v) headers.set(h, v);
  }

  return new NextResponse(upstream.body, { status: upstream.status, headers });
}
