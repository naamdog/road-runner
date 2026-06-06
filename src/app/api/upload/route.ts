import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getSession } from "@/lib/session";

export const runtime = "nodejs";

const VIDEO_MAX = 5 * 1024 * 1024 * 1024; // 5 GB (TubeRunner)
const IMAGE_MAX = 4 * 1024 * 1024; // 4 MB (thumbnails)

/**
 * Client-upload token endpoint for Vercel Blob.
 *
 * The browser uploads files DIRECTLY to Blob storage (bypassing this serverless
 * function), so large videos no longer stream through a 60s function. This route
 * only mints a short-lived, scoped upload token. No file body ever passes through
 * here, so there is no `maxDuration` bump.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json()) as HandleUploadBody;

  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        // Authenticate: only signed-in users may obtain an upload token.
        const session = await getSession();
        if (!session?.user) {
          throw new Error("Sign in first");
        }

        // The client tells us what kind of file this is so we can scope the
        // token's allowed content types and size cap. Default to the strict
        // image limits if anything is missing or malformed.
        let kind: "video" | "image" = "image";
        if (clientPayload) {
          try {
            const parsed = JSON.parse(clientPayload) as { kind?: unknown };
            if (parsed.kind === "video") kind = "video";
          } catch {
            // Ignore bad payloads; fall through to the image defaults.
          }
        }

        if (kind === "video") {
          return {
            allowedContentTypes: ["video/*"],
            maximumSizeInBytes: VIDEO_MAX,
            addRandomSuffix: false,
          };
        }
        return {
          allowedContentTypes: ["image/*"],
          maximumSizeInBytes: IMAGE_MAX,
          addRandomSuffix: false,
        };
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Storage error";
    const status = message === "Sign in first" ? 401 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
