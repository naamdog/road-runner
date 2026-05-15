"use client";

import { useRouter } from "next/navigation";
import { Film, Loader2, Repeat, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface LibraryItem {
  mediaId: string;
  blobUrl: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  durationMs: number | null;
  thumbnailUrl: string | null;
  postId: string;
  caption: string;
  publishedCount: number;
  lastPublishedAt: string | null;
}

export function LibraryGrid({ items }: { items: LibraryItem[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);

  function rerun(it: LibraryItem) {
    setPending(it.mediaId);
    const q = new URLSearchParams({
      media: it.mediaId,
      caption: it.caption,
      source: "library",
    });
    router.push(`/compose?${q.toString()}`);
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
      {items.map((it) => (
        <Card key={it.mediaId} className="p-0 overflow-hidden group">
          <div className="relative aspect-[9/16] bg-surface-3 overflow-hidden">
            {it.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={it.thumbnailUrl}
                alt=""
                className="size-full object-cover"
                loading="lazy"
              />
            ) : (
              <video
                src={it.blobUrl}
                preload="metadata"
                muted
                playsInline
                className="size-full object-cover"
              />
            )}
            <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-2">
              <Badge variant="brand" className="gap-1">
                <Sparkles className="size-2.5" />
                Instant
              </Badge>
            </div>
            <div className="absolute bottom-2 left-2 right-2 flex items-end justify-between gap-2 text-[10px] text-foreground/95 font-medium">
              <span className="rounded-full bg-black/70 backdrop-blur px-1.5 py-0.5 tabular-nums">
                Posted to {it.publishedCount} platform{it.publishedCount === 1 ? "" : "s"}
              </span>
            </div>
          </div>
          <div className="p-3 space-y-2">
            <div className="text-xs line-clamp-2 leading-tight min-h-[2.25rem] text-foreground/90">
              {it.caption || (
                <span className="text-subtle-foreground italic">No caption</span>
              )}
            </div>
            <Button
              onClick={() => rerun(it)}
              disabled={pending === it.mediaId}
              size="sm"
              variant="brand"
              className="w-full gap-1.5"
            >
              {pending === it.mediaId ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Repeat className="size-3.5" />
              )}
              Re-run
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}
