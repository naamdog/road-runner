import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { nanoid } from "nanoid";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const VIDEO_MAX = 5 * 1024 * 1024 * 1024; // 5 GB (TubeRunner)
const IMAGE_MAX = 4 * 1024 * 1024; // 4 MB (thumbnails)

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind") === "image" ? "image" : "video";

  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400 }
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file given" }, { status: 400 });
  }

  if (kind === "video") {
    if (!file.type.startsWith("video/")) {
      return NextResponse.json({ error: "File must be a video" }, { status: 400 });
    }
    if (file.size > VIDEO_MAX) {
      return NextResponse.json(
        { error: "File is over 5 GB. Try a smaller one." },
        { status: 400 }
      );
    }
  } else {
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }
    if (file.size > IMAGE_MAX) {
      return NextResponse.json(
        { error: "Image is over 4 MB. Try a smaller one." },
        { status: 400 }
      );
    }
  }

  const ext = (file.name.split(".").pop() || (kind === "image" ? "jpg" : "mp4"))
    .toLowerCase()
    .slice(0, 5);
  const folder = kind === "image" ? "thumbnails" : "videos";
  const key = `${folder}/${session.user.id}/${Date.now()}-${nanoid(8)}.${ext}`;

  try {
    const blob = await put(key, file, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: false,
    });
    return NextResponse.json({
      url: blob.url,
      pathname: blob.pathname,
      contentType: file.type,
      size: file.size,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Storage error";
    if (message.includes("BLOB_READ_WRITE_TOKEN")) {
      return NextResponse.json(
        {
          error:
            "Storage isn't set up. Add BLOB_READ_WRITE_TOKEN to your env.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
