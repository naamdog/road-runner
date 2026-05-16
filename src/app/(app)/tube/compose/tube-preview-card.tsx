"use client";

import { Calendar, EyeOff, Globe, Lock, Play, Tv } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  channelName: string;
  thumbnailUrl: string | null;
  visibility: "public" | "unlisted" | "private";
  scheduledLabel: string; // e.g. "Tomorrow at 10:00 AM"
  durationLabel: string | null; // e.g. "12:34"
}

/**
 * A mockup of how the video will look on YouTube. Lives at the top of the
 * compose form so the creator sees the finished thing as they edit.
 */
export function TubePreviewCard({
  title,
  channelName,
  thumbnailUrl,
  visibility,
  scheduledLabel,
  durationLabel,
}: Props) {
  const VisIcon = visibility === "public" ? Globe : visibility === "unlisted" ? EyeOff : Lock;
  return (
    <div className="rounded-xl border border-border bg-surface/60 overflow-hidden">
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-foreground uppercase tracking-wider text-[10px]">
          Preview
        </span>
        <span className="inline-flex items-center gap-1">
          <VisIcon className="size-3" />
          {visibility}
          <span aria-hidden>·</span>
          <Calendar className="size-3" />
          <span className="tabular-nums">{scheduledLabel}</span>
        </span>
      </div>
      <div className="p-4 grid sm:grid-cols-[200px_1fr] gap-3 items-start">
        <div className="relative aspect-video rounded-md overflow-hidden bg-surface-3 border border-border">
          {thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbnailUrl} alt="" className="size-full object-cover" />
          ) : (
            <div className="size-full flex items-center justify-center">
              <Tv className="size-5 text-muted-foreground" />
            </div>
          )}
          {durationLabel ? (
            <span className="absolute bottom-1.5 right-1.5 rounded bg-black/85 px-1.5 py-0.5 text-[10px] font-medium text-white tabular-nums">
              {durationLabel}
            </span>
          ) : null}
          <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity bg-black/40">
            <Play className="size-7 text-white fill-white" />
          </div>
        </div>
        <div className="min-w-0">
          <h3
            className={cn(
              "text-sm font-semibold leading-snug line-clamp-2 min-h-[2.5rem]",
              !title && "text-subtle-foreground italic font-normal"
            )}
          >
            {title || "Your title will show here"}
          </h3>
          <p className="mt-1.5 text-xs text-muted-foreground truncate">
            {channelName}
          </p>
          <p className="text-xs text-subtle-foreground mt-0.5">
            Scheduled by Road Runner
          </p>
        </div>
      </div>
    </div>
  );
}
