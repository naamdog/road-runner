import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { nanoid } from "nanoid";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 1024 * 1024 * 1024; // 1 GB

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!file.type.startsWith("video/")) {
    return NextResponse.json(
      { error: "File must be a video" },
      { status: 400 }
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "File exceeds 1 GB limit" },
      { status: 400 }
    );
  }

  const ext = (file.name.split(".").pop() || "mp4").toLowerCase().slice(0, 5);
  const key = `videos/${session.user.id}/${Date.now()}-${nanoid(8)}.${ext}`;

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
    const message =
      err instanceof Error ? err.message : "Storage error";
    if (message.includes("BLOB_READ_WRITE_TOKEN")) {
      return NextResponse.json(
        {
          error:
            "Storage is not configured. Set BLOB_READ_WRITE_TOKEN to enable uploads.",
        },
        { status: 500 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
