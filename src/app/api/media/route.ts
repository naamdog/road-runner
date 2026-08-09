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

  // Always ask upstream for a bounded range. A media element opens with
  // `bytes=0-`, and passing that straight through made the response stream in a
  // way the element never finished reading (networkState stayed LOADING while
  // readyState sat at 0). Capping the window and returning a buffered body
  // instead of a stream makes each response small, complete and seekable.
  const CHUNK = 2 * 1024 * 1024;
  const reqRange = req.headers.get("range");
  const start = reqRange ? Number(/bytes=(\d+)/.exec(reqRange)?.[1] ?? 0) : 0;
  const askedEnd = reqRange ? Number(/bytes=\d+-(\d+)/.exec(reqRange)?.[1] || NaN) : NaN;
  const end = Number.isFinite(askedEnd)
    ? Math.min(askedEnd, start + CHUNK - 1)
    : start + CHUNK - 1;

  const upstream = await fetch(target.toString(), {
    headers: { Range: `bytes=${start}-${end}` },
    cache: "no-store",
  });
  if (!upstream.ok && upstream.status !== 206) {
    return new NextResponse("Upstream error", { status: upstream.status });
  }

  const body = await upstream.arrayBuffer();
  // Upstream tells us the true total via Content-Range; the element needs it to
  // know the duration and to seek.
  const cr = upstream.headers.get("content-range");
  const total = cr ? Number(cr.split("/")[1]) : body.byteLength;
  const last = start + body.byteLength - 1;

  const headers = new Headers();
  headers.set("Content-Type", "video/mp4"); // the whole point
  headers.set("Accept-Ranges", "bytes");
  headers.set("Content-Length", String(body.byteLength));
  headers.set("Content-Range", `bytes ${start}-${last}/${total}`);
  headers.set("Cache-Control", "private, max-age=3600");

  return new NextResponse(body, { status: 206, headers });
}
