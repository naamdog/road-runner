"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Calendar,
  Check,
  Clock,
  ExternalLink,
  Film,
  Hash,
  Info,
  Loader2,
  Repeat,
  Trash2,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { PlatformIcon } from "@/components/platform-icon";
import {
  PLATFORM_META,
  type Platform,
  maxCaptionForPlatforms,
} from "@/lib/platforms";
import { cn, formatBytes, formatDuration } from "@/lib/utils";

export interface ComposeConnection {
  id: string;
  platform: Platform;
  accountName: string;
  accountHandle: string | null;
  avatarUrl: string | null;
  brandId: string | null;
}

interface PrefillMedia {
  mediaId: string;
  url: string;
  contentType: string;
  sizeBytes: number;
  durationMs: number | null;
  filename: string;
  thumbnailUrl: string | null;
}

interface Props {
  connections: ComposeConnection[];
  activeBrand: { id: string; name: string; color: string } | null;
  timezone: string;
  prefillMedia?: PrefillMedia | null;
  prefillCaption?: string | null;
  prefillSource?: string | null;
  prefillPermalink?: string | null;
}

interface Schedule {
  enabled: boolean;
  date: string;
  time: string;
}

type CaptionMode = "single" | "per-target";

export function ComposeForm({
  connections,
  activeBrand,
  timezone,
  prefillMedia,
  prefillCaption,
  prefillSource,
  prefillPermalink,
}: Props) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const isRerun = Boolean(prefillMedia || prefillCaption);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(
    prefillMedia?.url ?? null
  );
  const [duration, setDuration] = useState<number | null>(
    prefillMedia?.durationMs ?? null
  );
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(
    prefillMedia?.url ?? null
  );
  const [uploadedSize, setUploadedSize] = useState<number | null>(
    prefillMedia?.sizeBytes ?? null
  );
  const [uploadedContentType, setUploadedContentType] = useState<string | null>(
    prefillMedia?.contentType ?? null
  );
  const [existingMediaId, setExistingMediaId] = useState<string | null>(
    prefillMedia?.mediaId ?? null
  );
  const [filename, setFilename] = useState<string | null>(
    prefillMedia?.filename ?? null
  );

  const [captionMode, setCaptionMode] = useState<CaptionMode>("single");
  const [singleCaption, setSingleCaption] = useState(prefillCaption ?? "");
  const [perTargetCaptions, setPerTargetCaptions] = useState<Record<string, string>>(
    {}
  );

  const [schedules, setSchedules] = useState<Record<string, Schedule>>(() =>
    defaultSchedules(connections, isRerun)
  );
  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [pulledBannerVisible, setPulledBannerVisible] = useState(isRerun);

  const selectedConnections = connections.filter(
    (c) => schedules[c.id]?.enabled
  );
  const selectedPlatforms = Array.from(
    new Set(selectedConnections.map((c) => c.platform))
  );
  const captionMax = selectedPlatforms.length > 0
    ? maxCaptionForPlatforms(selectedPlatforms)
    : 100;

  const captionOver = captionMode === "single" && singleCaption.length > captionMax;
  const hashtagCount = (singleCaption.match(/#\w+/g) || []).length;

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!previewUrl || existingMediaId) return;
    const v = document.createElement("video");
    v.src = previewUrl;
    v.preload = "metadata";
    v.crossOrigin = "anonymous";
    v.onloadedmetadata = () => {
      setDuration(Math.round(v.duration * 1000));
    };
  }, [previewUrl, existingMediaId]);

  async function handleFileChosen(f: File) {
    if (!f.type.startsWith("video/")) {
      toast.error("Pick a video file (mp4, mov, or webm).");
      return;
    }
    if (f.size > 1024 * 1024 * 1024) {
      toast.error("That file is over 1 GB. Try a smaller one.");
      return;
    }
    setFile(f);
    setFilename(f.name);
    setUploadedUrl(null);
    setUploadedSize(null);
    setUploadedContentType(null);
    setExistingMediaId(null);
    setPulledBannerVisible(false);
    void uploadFile(f);
  }

  async function uploadFile(f: File) {
    setUploading(true);
    setUploadProgress(0);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const xhr = new XMLHttpRequest();
      const promise = new Promise<{
        url: string;
        size: number;
        contentType: string;
      }>((resolve, reject) => {
        xhr.open("POST", "/api/upload");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText));
            } catch {
              reject(new Error("Bad response"));
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

  function toggleConnection(connectionId: string) {
    setSchedules((prev) => ({
      ...prev,
      [connectionId]: {
        ...prev[connectionId],
        enabled: !prev[connectionId].enabled,
      },
    }));
  }

  function updateSchedule(connectionId: string, patch: Partial<Schedule>) {
    setSchedules((prev) => ({
      ...prev,
      [connectionId]: { ...prev[connectionId], ...patch },
    }));
  }

  function applyToAll(date: string, time: string) {
    setSchedules((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next)) {
        if (next[id].enabled) next[id] = { ...next[id], date, time };
      }
      return next;
    });
    toast.success("Time copied to every picked account.");
  }

  function autoStagger() {
    const enabled = connections.filter((c) => schedules[c.id]?.enabled);
    if (enabled.length === 0) {
      toast.error("Pick at least one account first.");
      return;
    }
    const base = nextMorning();
    setSchedules((prev) => {
      const next = { ...prev };
      enabled.forEach((c, i) => {
        const d = new Date(base.getTime() + i * 3 * 60 * 60 * 1000);
        next[c.id] = {
          enabled: true,
          date: toDateInput(d),
          time: toTimeInput(d),
        };
      });
      return next;
    });
    toast.success(`Spread across ${enabled.length} accounts (3-hour gaps).`);
  }

  function switchCaptionMode(mode: CaptionMode) {
    if (mode === captionMode) return;
    if (mode === "per-target") {
      // Seed each selected target with the single caption.
      const seed: Record<string, string> = { ...perTargetCaptions };
      for (const c of selectedConnections) {
        if (!seed[c.id]) seed[c.id] = singleCaption;
      }
      setPerTargetCaptions(seed);
    } else {
      // Switching back to single. If any per-target caption differs, ask.
      const all = Object.values(perTargetCaptions);
      const unique = new Set(all);
      if (unique.size > 1) {
        const ok = window.confirm(
          "Your captions are different. Keep just one for all? (We'll keep the longest.)"
        );
        if (!ok) return;
        const longest = all.reduce((a, b) => (b.length > a.length ? b : a), "");
        setSingleCaption(longest);
      }
    }
    setCaptionMode(mode);
  }

  function updatePerTargetCaption(connectionId: string, value: string) {
    setPerTargetCaptions((prev) => ({ ...prev, [connectionId]: value }));
  }

  async function handleSubmit() {
    const haveMedia = Boolean(uploadedUrl || existingMediaId);
    if (!haveMedia) {
      toast.error("Wait for the video to finish uploading.");
      return;
    }
    if (selectedConnections.length === 0) {
      toast.error("Pick at least one account.");
      return;
    }
    if (captionOver) {
      toast.error("Your caption is too long for one of the picked apps.");
      return;
    }

    const targets: {
      platform: Platform;
      scheduledAt: string;
      connectionId: string | null;
      caption?: string | null;
    }[] = [];

    for (const c of selectedConnections) {
      const s = schedules[c.id];
      if (!s.date || !s.time) {
        toast.error(`Set a date and time for ${c.accountName}.`);
        return;
      }
      const iso = localToIso(s.date, s.time);
      if (new Date(iso).getTime() <= Date.now() + 60_000) {
        toast.error(`${c.accountName} time must be in the future.`);
        return;
      }
      let cap: string | null = null;
      if (captionMode === "per-target") {
        const v = perTargetCaptions[c.id] ?? "";
        if (v.length > PLATFORM_META[c.platform].maxCaptionLength) {
          toast.error(
            `Caption for ${c.accountName} is too long for ${PLATFORM_META[c.platform].shortName}.`
          );
          return;
        }
        cap = v;
      }
      targets.push({
        platform: c.platform,
        scheduledAt: iso,
        connectionId: c.id,
        caption: cap,
      });
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        caption: captionMode === "single" ? singleCaption : "",
        targets,
        brandId: activeBrand?.id,
      };
      if (existingMediaId) {
        body.existingMediaId = existingMediaId;
      } else {
        body.media = {
          url: uploadedUrl,
          filename: filename || "video.mp4",
          contentType: uploadedContentType || "video/mp4",
          sizeBytes: uploadedSize || file?.size || 0,
          durationMs: duration,
        };
      }
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Could not line it up.");
      }
      toast.success(
        selectedConnections.length > 1
          ? `Lined up across ${selectedConnections.length} accounts.`
          : "Lined up."
      );
      router.push("/scheduled");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not line it up.");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setFile(null);
    setUploadedUrl(null);
    setPreviewUrl(null);
    setDuration(null);
    setSingleCaption("");
    setPerTargetCaptions({});
    setFilename(null);
    setExistingMediaId(null);
    setPulledBannerVisible(false);
    setSchedules(defaultSchedules(connections, false));
  }

  // Group connections by platform for cleaner rendering
  const groupedConnections = useMemo(() => {
    const m = new Map<Platform, ComposeConnection[]>();
    for (const c of connections) {
      if (!m.has(c.platform)) m.set(c.platform, []);
      m.get(c.platform)!.push(c);
    }
    return m;
  }, [connections]);

  if (connections.length === 0) {
    return (
      <div className="container-page py-7 max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">New post</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect your first social account to start posting.
          </p>
        </div>
        <Card className="p-10 text-center">
          <div className="size-12 mx-auto rounded-md bg-surface-2 border border-border flex items-center justify-center">
            <Upload className="size-5 text-muted-foreground" />
          </div>
          <h3 className="mt-3 text-sm font-semibold">
            No accounts connected to{" "}
            {activeBrand ? (
              <span style={{ color: activeBrand.color }}>{activeBrand.name}</span>
            ) : (
              "this brand"
            )}{" "}
            yet
          </h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
            Pick a social app (YouTube, Instagram, TikTok, LinkedIn, or
            Facebook) to connect. Then come back and post.
          </p>
          <Button asChild variant="brand" size="sm" className="mt-4">
            <Link href="/connections">Connect an account</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="container-page py-7 max-w-6xl">
      {pulledBannerVisible ? (
        <div className="mb-5 rounded-md border border-brand/30 bg-brand/[0.06] px-4 py-3 flex items-center gap-3">
          <div className="size-8 rounded-md bg-brand/15 border border-brand/30 flex items-center justify-center shrink-0">
            <Repeat className="size-4 text-brand" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium">
              {prefillSource === "library"
                ? "Re-running from your library — video and caption are ready."
                : prefillMedia
                ? `Pulled from ${prefillSource ?? "your platform"} — ready to line up.`
                : `Caption from ${prefillSource ?? "your platform"} pre-filled — pick the video to keep going.`}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Every connected account in this brand is picked. Set the times
              and hit "Line up".
            </div>
          </div>
          {prefillPermalink ? (
            <a
              href={prefillPermalink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-brand hover:underline inline-flex items-center gap-1 shrink-0"
            >
              See original
              <ExternalLink className="size-3" />
            </a>
          ) : null}
          <button
            onClick={() => setPulledBannerVisible(false)}
            className="size-7 inline-flex items-center justify-center rounded hover:bg-surface-2 shrink-0"
            aria-label="Hide"
          >
            <X className="size-3.5 text-muted-foreground" />
          </button>
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            {isRerun ? (
              <>
                <Repeat className="size-5 text-brand" />
                Re-run
              </>
            ) : (
              "New post"
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
            {activeBrand ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="size-2 rounded-full"
                  style={{ background: activeBrand.color }}
                />
                <span className="text-foreground font-medium">{activeBrand.name}</span>
              </span>
            ) : null}
            <span>·</span>
            <span>Your time zone: <span className="text-foreground font-medium">{timezone}</span></span>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={reset} disabled={submitting}>
            Clear
          </Button>
          <Button
            variant="brand"
            onClick={handleSubmit}
            disabled={submitting || uploading || (!uploadedUrl && !existingMediaId)}
            size="lg"
            className="gap-1.5"
          >
            {submitting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Lining up…
              </>
            ) : (
              <>
                <Zap className="size-4" />
                Line up {selectedConnections.length > 0 ? `(${selectedConnections.length})` : ""}
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[340px_1fr] gap-5">
        {/* Video upload */}
        <div className="space-y-4">
          <Card className="p-0 overflow-hidden">
            {previewUrl ? (
              <div className="relative aspect-[9/16] bg-black">
                <video
                  src={previewUrl}
                  className="size-full object-contain"
                  controls
                  playsInline
                  crossOrigin="anonymous"
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
                {!uploading && (uploadedUrl || existingMediaId) ? (
                  <div className="absolute top-3 right-3">
                    <Badge variant="success" className="gap-1">
                      <Check className="size-3" />
                      Ready
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
                  <p className="text-sm font-medium">Drop a video here</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    or tap to pick · mp4 / mov / webm · tall (9:16) works best
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

          {file || existingMediaId ? (
            <Card className="p-4 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Film className="size-3.5" />
                <span className="truncate font-mono text-foreground">
                  {filename || "(pulled video)"}
                </span>
              </div>
              {uploadedSize ? (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Size</span>
                  <span className="font-mono text-foreground">
                    {formatBytes(uploadedSize)}
                  </span>
                </div>
              ) : null}
              {duration ? (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Length</span>
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

        {/* Caption + schedule */}
        <div className="space-y-5">
          <Card>
            <div className="p-5 pb-3 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <h2 className="text-base font-semibold tracking-tight">Caption</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {captionMode === "single"
                    ? "One caption used for every account."
                    : "Write a different caption for each account."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex h-8 items-center rounded-md border border-border bg-surface p-0.5">
                  <button
                    onClick={() => switchCaptionMode("single")}
                    className={cn(
                      "h-7 px-2.5 rounded-sm text-xs font-medium transition-colors",
                      captionMode === "single"
                        ? "bg-surface-3 text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    One caption
                  </button>
                  <button
                    onClick={() => switchCaptionMode("per-target")}
                    disabled={selectedConnections.length === 0}
                    className={cn(
                      "h-7 px-2.5 rounded-sm text-xs font-medium transition-colors",
                      captionMode === "per-target"
                        ? "bg-surface-3 text-foreground"
                        : "text-muted-foreground hover:text-foreground",
                      "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                  >
                    Per app
                  </button>
                </div>
                {captionMode === "single" ? (
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
                      {singleCaption.length} / {captionMax}
                    </span>
                  </div>
                ) : null}
              </div>
            </div>
            <Separator />
            <div className="p-5">
              {captionMode === "single" ? (
                <>
                  <Textarea
                    placeholder="Catchy first line. Strong next line. Tell them what to do. #hashtag #shorts"
                    rows={4}
                    value={singleCaption}
                    onChange={(e) => setSingleCaption(e.target.value)}
                    className="resize-none border-0 bg-transparent p-0 text-base focus-visible:ring-0 placeholder:text-subtle-foreground/80"
                  />
                  {selectedPlatforms.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {selectedPlatforms.map((p) => {
                        const meta = PLATFORM_META[p];
                        const over = singleCaption.length > meta.maxCaptionLength;
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
                            <span>
                              {meta.shortName}: {singleCaption.length}/{meta.maxCaptionLength}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-3 text-xs text-muted-foreground">
                      Pick at least one account below to see the limits.
                    </p>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  {selectedConnections.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      Pick at least one account below.
                    </p>
                  ) : (
                    selectedConnections.map((c) => {
                      const meta = PLATFORM_META[c.platform];
                      const val = perTargetCaptions[c.id] ?? "";
                      const over = val.length > meta.maxCaptionLength;
                      return (
                        <div key={c.id} className="rounded-md border border-border bg-surface-2/30 p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <PlatformIcon platform={c.platform} size={16} />
                              <span className="text-sm font-medium truncate">
                                {c.accountName}
                              </span>
                              <span className="text-xs text-muted-foreground truncate">
                                · {meta.shortName}
                              </span>
                            </div>
                            <span
                              className={cn(
                                "text-xs font-mono tabular-nums",
                                over ? "text-destructive" : "text-muted-foreground"
                              )}
                            >
                              {val.length} / {meta.maxCaptionLength}
                            </span>
                          </div>
                          <Textarea
                            placeholder={`Write a caption for ${meta.shortName}…`}
                            rows={3}
                            value={val}
                            onChange={(e) =>
                              updatePerTargetCaption(c.id, e.target.value)
                            }
                            className="resize-none bg-transparent text-sm"
                          />
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          </Card>

          <Card>
            <div className="p-5 pb-3 flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold tracking-tight">
                  Where and when
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Pick which accounts to post to and pick a time for each.
                </p>
              </div>
              <div className="flex gap-1.5">
                <Button variant="outline" size="sm" onClick={autoStagger}>
                  Spread times
                </Button>
              </div>
            </div>
            <Separator />
            <div className="divide-y divide-border">
              {Array.from(groupedConnections.entries()).map(([platform, accounts]) => (
                <div key={platform}>
                  {accounts.length > 1 ? (
                    <div className="px-5 pt-3 pb-1 text-xs uppercase tracking-wider text-subtle-foreground flex items-center gap-1.5">
                      <PlatformIcon platform={platform} size={12} />
                      <span>{PLATFORM_META[platform].name}</span>
                      <span className="text-subtle-foreground/60">· {accounts.length} accounts</span>
                    </div>
                  ) : null}
                  {accounts.map((c) => {
                    const s = schedules[c.id] || { enabled: false, date: "", time: "" };
                    return (
                      <div
                        key={c.id}
                        className={cn(
                          "px-5 py-3 flex items-center gap-4",
                          !s.enabled && "opacity-60"
                        )}
                      >
                        <button
                          onClick={() => toggleConnection(c.id)}
                          className={cn(
                            "flex items-center gap-2.5 min-w-[200px] py-1 rounded-md",
                            "text-left hover:bg-surface-2/40 -mx-2 px-2 transition-colors"
                          )}
                        >
                          <div
                            className={cn(
                              "size-4 rounded-sm border flex items-center justify-center shrink-0",
                              s.enabled
                                ? "bg-brand border-brand text-brand-foreground"
                                : "border-border-strong bg-surface"
                            )}
                          >
                            {s.enabled ? <Check className="size-3 stroke-[3]" /> : null}
                          </div>
                          {accounts.length === 1 ? (
                            <PlatformIcon platform={c.platform} size={20} />
                          ) : null}
                          <div className="min-w-0">
                            <div className="text-sm font-medium truncate">
                              {c.accountName}
                            </div>
                            {c.accountHandle ? (
                              <div className="text-[11px] text-muted-foreground truncate">
                                @{c.accountHandle.replace(/^@/, "")}
                              </div>
                            ) : (
                              <div className="text-[11px] text-muted-foreground truncate">
                                {PLATFORM_META[c.platform].shortName}
                              </div>
                            )}
                          </div>
                        </button>

                        <div className="flex items-center gap-2 ml-auto flex-wrap">
                          <div className="relative">
                            <Calendar className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                            <input
                              type="date"
                              disabled={!s.enabled}
                              value={s.date}
                              min={toDateInput(new Date())}
                              onChange={(e) => updateSchedule(c.id, { date: e.target.value })}
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
                              onChange={(e) => updateSchedule(c.id, { time: e.target.value })}
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
                            title="Copy this time to every picked account"
                          >
                            <span className="text-[10px] font-mono">→ ALL</span>
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </Card>

          <div className="rounded-md bg-surface/40 border border-border px-4 py-3 flex items-start gap-2.5">
            <Info className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              {isRerun
                ? "Tip: change the first second or first line so it feels fresh."
                : "Tip: space out posts by 2–6 hours so each audience sees it fresh. The first 3 seconds matter most."}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- helpers ---

function defaultSchedules(
  connections: ComposeConnection[],
  autoEnableAll: boolean
): Record<string, Schedule> {
  const base = nextMorning();
  const obj: Record<string, Schedule> = {};
  connections.forEach((c, i) => {
    const t = new Date(base.getTime() + i * 3 * 60 * 60 * 1000);
    obj[c.id] = {
      enabled: autoEnableAll,
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
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function localToIso(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const dt = new Date(y, m - 1, d, hh, mm, 0, 0);
  return dt.toISOString();
}
