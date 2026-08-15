import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE, verifyToken } from "@/lib/gate";

export const runtime = "nodejs";

/**
 * Mint a Blotato upload URL.
 *
 * The browser uploads the video straight to Blotato rather than through here:
 * clips run to 150MB and a Vercel function body caps out around 4.5MB. Blotato's
 * storage allows cross-origin PUTs, so this route only hands over a short-lived
 * URL and never touches the bytes — which also keeps the API key server-side.
 */
export async function POST(req: NextRequest) {
  const jar = await cookies();
  if (!verifyToken(jar.get(COOKIE)?.value)) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  const key = process.env.BLOTATO_API_KEY;
  if (!key) return NextResponse.json({ error: "BLOTATO_API_KEY not set" }, { status: 500 });

  let filename = "upload.mp4";
  try {
    const body = (await req.json()) as { filename?: string };
    if (body.filename) filename = body.filename;
  } catch {
    /* keep the default */
  }
  // Blotato only publishes H.264 MP4; anything else fails after it accepts the post.
  if (!/\.mp4$/i.test(filename)) {
    return NextResponse.json(
      { error: "Only .mp4 files are supported — convert .mov first." },
      { status: 400 }
    );
  }

  const res = await fetch("https://backend.blotato.com/v2/media/uploads", {
    method: "POST",
    headers: { "blotato-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ filename }),
  });
  const text = await res.text();
  if (!res.ok) {
    return NextResponse.json({ error: `Blotato: ${text.slice(0, 200)}` }, { status: res.status });
  }
  return NextResponse.json(JSON.parse(text));
}
