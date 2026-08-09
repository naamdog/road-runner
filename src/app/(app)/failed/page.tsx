import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { getQueue } from "@/lib/blotato";
import { PlatformChip, Thumb, fmtDay, fmtTime } from "@/components/queue-ui";

export const metadata: Metadata = { title: "Failed" };
export const dynamic = "force-dynamic";

/** Plain-English translation of Blotato's processing errors. */
function explain(err: string | null): string {
  if (!err) return "Blotato couldn't publish this one.";
  const e = err.toLowerCase();
  if (e.includes("fetch media")) {
    return "Blotato couldn't download the video — the link was unreachable or wasn't a real video file.";
  }
  if (e.includes("previous media upload failed")) {
    return "The video for this post never uploaded properly, so the post had nothing to publish.";
  }
  if (e.includes("past")) return "The scheduled time had already passed.";
  return err;
}

export default async function FailedPage() {
  let failed: Awaited<ReturnType<typeof getQueue>> = [];
  let error: string | null = null;
  try {
    failed = (await getQueue()).filter((q) => q.state === "failed");
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not reach Blotato";
  }

  return (
    <div className="container-page py-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Failed posts</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-prose">
          Blotato accepts a post first and fetches its video afterwards — so a post can
          be accepted and still fail later. These never went out and never will;
          they need re-creating with a working video.
        </p>
      </div>

      {error ? (
        <Card className="p-6 border-destructive/40 bg-destructive/5">
          <p className="text-sm">Couldn&apos;t load: {error}</p>
        </Card>
      ) : failed.length === 0 ? (
        <Card className="px-6 py-16 text-center">
          <CheckCircle2 className="size-8 text-success mx-auto" />
          <h2 className="mt-3 text-sm font-semibold">Nothing failed</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Every scheduled post has a working video attached.
          </p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-border bg-destructive/5">
            <span className="text-sm font-medium">
              {failed.length} failed post{failed.length === 1 ? "" : "s"}
            </span>
          </div>
          <ul className="divide-y divide-border">
            {failed.map((f) => (
              <li key={f.id} className="flex gap-4 px-5 py-4">
                <Thumb url={f.mediaUrl} className="w-12 h-20 rounded-md shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm line-clamp-2">{f.text}</p>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <PlatformChip platform={f.platform} size="xs" />
                    {f.postTime ? (
                      <span className="text-xs text-muted-foreground tabular-nums">
                        {fmtDay(f.postTime)} {fmtTime(f.postTime)}
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-destructive mt-2">{explain(f.error)}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
