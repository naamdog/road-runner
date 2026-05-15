"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  Calendar,
  Check,
  Clock,
  Film,
  Hash,
  Info,
  Loader2,
  Trash2,
  Upload,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PlatformIcon } from "@/components/platform-icon";
import {
  PLATFORMS,
  PLATFORM_META,
  type Platform,
  maxCaptionForPlatforms,
} from "@/lib/platforms";
import { cn, formatBytes, formatDuration } from "@/lib/utils";

interface Connection {
  id: string;
  platform: Platform;
  accountName: string;
}

interface Props {
  connections: Connection[];
  timezone: string;
}

interface PlatformSchedule {
  enabled: boolean;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
}

type Schedules = Record<Platform, PlatformSchedule>;

const ALL_PLATFORMS = PLATFORMS;

export function ComposeForm({ connections, timezone }: Props) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadedSize, setUploadedSize] = useState<number | null>(null);
  const [uploadedContentType, setUploadedContentType] = useState<string | null>(
    null
  );
  const [filename, setFilename] = useState<string | null>(null);

  const [caption, setCaption] = useState("");
  const [schedules, setSchedules] = useState<Schedules>(() => defaultSchedules());
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const selectedPlatforms = ALL_PLATFORMS.filter((p) => schedules[p].enabled);
  const captionMax = selectedPlatforms.length > 0
    ? maxCaptionForPlatforms(selectedPlatforms)
    : 100;

  const captionOver = caption.length > captionMax;
  const hashtagCount = (caption.match(/#\w+/g) || []).length;

  // Generate preview URL for video
  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Probe duration
  useEffect(() => {
    if (!previewUrl) return;
    const v = document.createElement("video");
    v.src = previewUrl;
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      setDuration(Math.round(v.duration * 1000));
    };
  }, [previewUrl]);

  async function handleFileChosen(f: File) {
    if (!f.type.startsWith("video/")) {
      toast.error("Please upload a video file (mp4, mov, webm).");
      return;
    }
    if (f.size > 1024 * 1024 * 1024) {
      toast.error("File is larger than 1 GB. Please re-encode at lower bitrate.");
      return;
    }
    setFile(f);
    setFilename(f.name);
    setUploadedUrl(null);
    setUploadedSize(null);
    setUploadedContentType(null);
    void uploadFile(f);
  }

  async function uploadFile(f: File) {
    setUploading(true);
    setUploadProgress(0);

    try {
      const fd = new FormData();
      fd.append("file", f);

      const xhr = new XMLHttpRequest();
      const promise = new Promise<{ url: string; size: number; contentType: string }>((resolve, reject) => {
        xhr.open("POST", "/api/upload");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              const json = JSON.parse(xhr.responseText);
              resolve(json);
            } catch (e) {
              reject(new Error("Invalid response"));
            }
          } else {
            try {
              const j = JSON.parse(xhr.responseText);
              reject(new Error(j.error || `Upload failed (${xhr.status})`));
            } catch {
              reject(new Error(`Upload failed (${xhr.status})`));
            }
          }
        };
        xhr.onerror = () => reject(new Error("Upload failed"));
        xhr.send(fd);
      });

      const { url, size, contentType } = await promise;
      setUploadedUrl(url);
      setUploadedSize(size);
      setUploadedContentType(contentType);
      toast.success("Video uploaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
      setFile(null);
      setPreviewUrl(null);
    } finally {
      setUploading(false);
    }
  }

  function togglePlatform(p: Platform) {
    setSchedules((prev) => ({
      ...prev,
      [p]: { ...prev[p], enabled: !prev[p].enabled },
    }));
  }

  function updateSchedule(p: Platform, patch: Partial<PlatformSchedule>) {
    setSchedules((prev) => ({ ...prev, [p]: { ...prev[p], ...patch } }));
  }

  function applyToAll(date: string, time: string) {
    setSchedules((prev) => {
      const next = { ...prev };
      for (const p of ALL_PLATFORMS) {
        if (next[p].enabled) {
          next[p] = { ...next[p], date, time };
        }
      }
      return next;
    });
    toast.success("Applied to all selected platforms.");
  }

  function autoStagger() {
    const enabled = ALL_PLATFORMS.filter((p) => schedules[p].enabled);
    if (enabled.length === 0) {
      toast.error("Select at least one platform first.");
      return;
    }
    const base = nextMorning();
    setSchedules((prev) => {
      const next = { ...prev };
      enabled.forEach((p, i) => {
        const d = new Date(base.getTime() + i * 3 * 60 * 60 * 1000);
        next[p] = {
          enabled: true,
          date: toDateInput(d),
          time: toTimeInput(d),
        };
      });
      return next;
    });
    toast.success("Staggered across selected platforms (3-hour gaps).");
  }

  async function handleSubmit() {
    if (!uploadedUrl) {
      toast.error("Wait for the video to finish uploading.");
      return;
    }
    if (selectedPlatforms.length === 0) {
      toast.error("Pick at least one platform.");
      return;
    }
    if (captionOver) {
      toast.error("Caption is over the limit for one of the selected platforms.");
      return;
    }

    // Validate schedules + check missing connections
    const missing: Platform[] = [];
    const targets: { platform: Platform; scheduledAt: string; connectionId: string | null }[] =
      [];
    for (const p of selectedPlatforms) {
      const { date, time } = schedules[p];
      if (!date || !time) {
        toast.error(`Set a date and time for ${PLATFORM_META[p].shortName}.`);
        return;
      }
      const iso = localToIso(date, time);
      if (new Date(iso).getTime() <= Date.now() + 60_000) {
        toast.error(
          `${PLATFORM_META[p].shortName} time must be in the future.`
        );
        return;
      }
      const conn = connections.find((c) => c.platform === p);
      if (!conn) missing.push(p);
      targets.push({
        platform: p,
        scheduledAt: iso,
        connectionId: conn?.id ?? null,
      });
    }

    if (missing.length > 0) {
      toast.warning(
        `Not connected: ${missing
          .map((p) => PLATFORM_META[p].shortName)
          .join(", ")}. We'll save these as drafts.`
      );
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          caption,
          media: {
            url: uploadedUrl,
            filename: filename || "video.mp4",
            contentType: uploadedContentType || "video/mp4",
            sizeBytes: uploadedSize || file?.size || 0,
            durationMs: duration,
          },
          targets,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Could not schedule.");
      }
      toast.success(
        selectedPlatforms.length > 1
          ? `Scheduled across ${selectedPlatforms.length} platforms.`
          : "Scheduled."
      );
      router.push("/scheduled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not schedule.");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setFile(null);
    setUploadedUrl(null);
    setPreviewUrl(null);
    setDuration(null);
    setCaption("");
    setFilename(null);
    setSchedules(defaultSchedules());
  }

  return (
    <div className="container-page py-7 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">New short</h1>
          <p className="text-sm text-muted-foreground mt-1">
            One piece, five platforms, five times. Timezone:{" "}
            <span className="text-foreground font-medium">{timezone}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={reset} disabled={submitting}>
            Clear
          </Button>
          <Button
            variant="brand"
            onClick={handleSubmit}
            disabled={submitting || uploading || !uploadedUrl}
            size="lg"
            className="gap-1.5"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Scheduling…
              </>
            ) : (
              <>
                <Zap className="size-4" />
                Schedule {selectedPlatforms.length > 0
                  ? `(${selectedPlatforms.length})`
                  : ""}
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[340px_1fr] gap-5">
        {/* Left: Video upload + preview */}
        <div className="space-y-4">
          <Card className="p-0 overflow-hidden">
            {previewUrl ? (
              <div className="relative aspect-[9/16] bg-black">
                <video
                  src={previewUrl}
                  className="size-full object-contain"
                  controls
                  playsInline
                />
                {uploading ? (
                  <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                    <div className="flex items-center justify-between text-xs text-foreground mb-1.5">
                      <span>Uploading…</span>
                      <span className="font-mono">{uploadProgress}%</span>
                    </div>
                    <Progress value={uploadProgress} />
                  </div>
                ) : null}
                {!uploading && uploadedUrl ? (
                  <div className="absolute top-3 right-3">
                    <Badge variant="success" className="gap-1">
                      <Check className="size-3" /> Uploaded
                    </Badge>
                  </div>
                ) : null}
              </div>
            ) : (
              <button
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragOver(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void handleFileChosen(f);
                }}
                className={cn(
                  "w-full aspect-[9/16] flex flex-col items-center justify-center gap-3 border-2 border-dashed transition-colors",
                  dragOver
                    ? "border-brand bg-brand/5"
                    : "border-border bg-surface-2/30 hover:bg-surface-2/60 hover:border-border-strong"
                )}
              >
                <div className="size-12 rounded-md bg-surface-3 border border-border flex items-center justify-center">
                  <Upload className="size-5 text-muted-foreground" />
                </div>
                <div className="text-center px-4">
                  <p className="text-sm font-medium">Drop a short here</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    or click to browse · mp4 / mov / webm · 9:16 recommended
                  </p>
                </div>
              </button>
            )}
          </Card>

          <input
            ref={fileInput}
            type="file"
            accept="video/mp4,video/quicktime,video/webm,video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFileChosen(f);
            }}
          />

          {file ? (
            <Card className="p-4 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Film className="size-3.5" />
                <span className="truncate font-mono text-foreground">
                  {filename}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Size</span>
                <span className="font-mono text-foreground">
                  {formatBytes(file.size)}
                </span>
              </div>
              {duration ? (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Duration</span>
                  <span className="font-mono text-foreground">
                    {formatDuration(duration)}
                  </span>
                </div>
              ) : null}
              <Separator className="my-2" />
              <button
                onClick={reset}
                className="flex items-center gap-1.5 text-destructive hover:text-destructive text-xs"
              >
                <Trash2 className="size-3.5" />
                Remove
              </button>
            </Card>
          ) : null}
        </div>

        {/* Right: Caption + platforms + schedule */}
        <div className="space-y-5">
          {/* Caption */}
          <Card>
            <div className="p-5 pb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold tracking-tight">
                  Caption
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  One caption for all platforms — pre-flighted against each limit.
                </p>
              </div>
              <div className="text-xs font-mono tabular-nums flex items-center gap-3">
                <span className="text-muted-foreground inline-flex items-center gap-1">
                  <Hash className="size-3" />
                  {hashtagCount}
                </span>
                <span
                  className={cn(
                    "tabular-nums",
                    captionOver ? "text-destructive" : "text-muted-foreground"
                  )}
                >
                  {caption.length} / {captionMax}
                </span>
              </div>
            </div>
            <Separator />
            <div className="p-5">
              <Textarea
                placeholder="Hook line. Punchy second line. Call-to-action. #hashtag #shorts"
                rows={4}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                className="resize-none border-0 bg-transparent p-0 text-base focus-visible:ring-0 placeholder:text-subtle-foreground/80"
              />
              {selectedPlatforms.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {selectedPlatforms.map((p) => {
                    const meta = PLATFORM_META[p];
                    const over = caption.length > meta.maxCaptionLength;
                    return (
                      <div
                        key={p}
                        className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] border",
                          over
                            ? "bg-destructive/15 border-destructive/30 text-destructive"
                            : "bg-surface-2 border-border text-muted-foreground"
                        )}
                      >
                        <PlatformIcon platform={p} size={12} />
                        <span>{meta.shortName}: {caption.length}/{meta.maxCaptionLength}</span>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </Card>

          {/* Platforms + times */}
          <Card>
            <div className="p-5 pb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold tracking-tight">
                  Schedule per platform
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Same caption, different time on each platform.
                </p>
              </div>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" onClick={autoStagger}>
                  Auto-stagger
                </Button>
              </div>
            </div>
            <Separator />
            <div className="divide-y divide-border">
              {ALL_PLATFORMS.map((p) => {
                const meta = PLATFORM_META[p];
                const s = schedules[p];
                const conn = connections.find((c) => c.platform === p);
                return (
                  <div
                    key={p}
                    className={cn(
                      "px-5 py-3.5 flex items-center gap-4",
                      !s.enabled && "opacity-60"
                    )}
                  >
                    <button
                      onClick={() => togglePlatform(p)}
                      className={cn(
                        "flex items-center gap-2.5 min-w-[160px] py-1 rounded-md",
                        "text-left hover:bg-surface-2/40 -mx-2 px-2 transition-colors"
                      )}
                    >
                      <div
                        className={cn(
                          "size-4 rounded-sm border flex items-center justify-center",
                          s.enabled
                            ? "bg-brand border-brand text-brand-foreground"
                            : "border-border-strong bg-surface"
                        )}
                      >
                        {s.enabled ? <Check className="size-3 stroke-[3]" /> : null}
                      </div>
                      <PlatformIcon platform={p} size={20} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium">{meta.shortName}</div>
                        {conn ? (
                          <div className="text-[11px] text-muted-foreground truncate">
                            {conn.accountName}
                          </div>
                        ) : (
                          <div className="text-[11px] text-warning truncate">
                            Not connected
                          </div>
                        )}
                      </div>
                    </button>

                    <div className="flex items-center gap-2 ml-auto">
                      <div className="relative">
                        <Calendar className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <input
                          type="date"
                          disabled={!s.enabled}
                          value={s.date}
                          min={toDateInput(new Date())}
                          onChange={(e) =>
                            updateSchedule(p, { date: e.target.value })
                          }
                          className={cn(
                            "h-9 rounded-md border border-border bg-surface pl-8 pr-2.5 text-sm",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:border-brand/60",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                            "[color-scheme:dark]"
                          )}
                        />
                      </div>
                      <div className="relative">
                        <Clock className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                        <input
                          type="time"
                          disabled={!s.enabled}
                          value={s.time}
                          onChange={(e) =>
                            updateSchedule(p, { time: e.target.value })
                          }
                          className={cn(
                            "h-9 rounded-md border border-border bg-surface pl-8 pr-2.5 text-sm",
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:border-brand/60",
                            "disabled:opacity-50 disabled:cursor-not-allowed",
                            "[color-scheme:dark]"
                          )}
                        />
                      </div>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        disabled={!s.enabled}
                        onClick={() => applyToAll(s.date, s.time)}
                        title="Apply this date/time to all selected"
                      >
                        <span className="text-[10px] font-mono">→ ALL</span>
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {selectedPlatforms.some(
              (p) => !connections.find((c) => c.platform === p)
            ) ? (
              <div className="border-t border-border bg-warning/5 px-5 py-3 flex items-start gap-2.5">
                <AlertTriangle className="size-4 text-warning mt-0.5 shrink-0" />
                <div className="text-xs text-muted-foreground">
                  Some selected platforms aren't connected yet. We'll save those
                  as drafts.{" "}
                  <Link
                    href="/connections"
                    className="text-foreground underline-offset-4 hover:underline"
                  >
                    Connect now →
                  </Link>
                </div>
              </div>
            ) : null}
          </Card>

          {/* Help row */}
          <div className="rounded-md bg-surface/40 border border-border px-4 py-3 flex items-start gap-2.5">
            <Info className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Short-form best practice: stagger by 2–6 hours so the same hook
              lands fresh on each platform. The first 3 seconds matter most —
              hook before the swipe.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- helpers ---

function defaultSchedules(): Schedules {
  const base = nextMorning();
  const obj = {} as Schedules;
  ALL_PLATFORMS.forEach((p, i) => {
    const t = new Date(base.getTime() + i * 3 * 60 * 60 * 1000);
    obj[p] = {
      enabled: false,
      date: toDateInput(t),
      time: toTimeInput(t),
    };
  });
  return obj;
}

function nextMorning(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return d;
}

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toTimeInput(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(
    2,
    "0"
  )}`;
}

function localToIso(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  return dt.toISOString();
}
