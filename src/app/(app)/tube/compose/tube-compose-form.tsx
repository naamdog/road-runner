"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Check,
  Clock,
  EyeOff,
  Film,
  Globe,
  Hash,
  Image as ImageIcon,
  Info,
  ListVideo,
  Loader2,
  Lock,
  Plus,
  Tag,
  Trash2,
  Tv,
  Upload,
  X,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { YOUTUBE_CATEGORIES } from "@/lib/youtube-categories";
import { cn, formatBytes, formatDuration } from "@/lib/utils";
import { TubePreviewCard } from "./tube-preview-card";
import { TubePreflight, type PreflightItem } from "./tube-preflight";

export interface TubeAccount {
  id: string;
  accountName: string;
  accountHandle: string | null;
}

interface Props {
  accounts: TubeAccount[];
  activeBrand: { id: string; name: string; color: string } | null;
  timezone: string;
}

type Visibility = "public" | "unlisted" | "private";

interface PlaylistOption {
  id: string;
  title: string;
  count: number;
}

const TAG_TOTAL_LIMIT = 500;

export function TubeComposeForm({ accounts, activeBrand, timezone }: Props) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const thumbInput = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadedSize, setUploadedSize] = useState<number | null>(null);
  const [uploadedCt, setUploadedCt] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);

  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [thumbUploading, setThumbUploading] = useState(false);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [categoryId, setCategoryId] = useState("22");
  const [visibility, setVisibility] = useState<Visibility>("public");
  const [madeForKids, setMadeForKids] = useState(false);
  const [date, setDate] = useState(toDateInput(nextMorning()));
  const [time, setTime] = useState(toTimeInput(nextMorning()));

  const [playlists, setPlaylists] = useState<PlaylistOption[]>([]);
  const [playlistId, setPlaylistId] = useState<string>("");
  const [playlistsLoading, setPlaylistsLoading] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // --- Derived values ---

  const tagsTotalChars = useMemo(
    () => tags.reduce((sum, t) => sum + t.length, 0) + Math.max(0, tags.length - 1),
    [tags]
  );
  const tagsOver = tagsTotalChars > TAG_TOTAL_LIMIT;

  const hashtagCount = useMemo(
    () => (description.match(/#\w+/g) || []).length,
    [description]
  );

  const chapters = useMemo(() => detectChapters(description), [description]);

  const channelName =
    accounts.find((a) => a.id === accountId)?.accountName ?? "Your channel";
  const scheduledIso = useMemo(() => localToIso(date, time), [date, time]);
  const scheduledLabel = useMemo(() => labelFromIso(scheduledIso), [scheduledIso]);
  const durationLabel = duration ? formatDuration(duration) : null;
  const inFuture = new Date(scheduledIso).getTime() > Date.now() + 60_000;

  const preflightItems: PreflightItem[] = useMemo(() => {
    const items: PreflightItem[] = [];
    items.push(
      uploadedUrl
        ? {
            status: "ok",
            label: "Video uploaded",
            detail: filename ?? undefined,
          }
        : uploading
        ? { status: "warn", label: "Uploading video…", detail: `${uploadProgress}%` }
        : { status: "missing", label: "Pick a video" }
    );
    items.push(
      title.trim()
        ? title.length > 100
          ? { status: "warn", label: "Title is over 100 characters", detail: `${title.length} / 100` }
          : {
              status: "ok",
              label: "Title set",
              detail: `${title.length} / 100`,
            }
        : { status: "missing", label: "Add a title" }
    );
    items.push(
      description.trim()
        ? {
            status: "ok",
            label: "Description set",
            detail: `${description.length} chars · ${hashtagCount} hashtags${
              chapters > 0 ? ` · ${chapters} chapters` : ""
            }`,
          }
        : { status: "warn", label: "Add a description (helps YouTube find it)" }
    );
    items.push(
      thumbUrl
        ? { status: "ok", label: "Custom thumbnail uploaded" }
        : { status: "warn", label: "No custom thumbnail (YouTube will pick one)" }
    );
    items.push(
      tags.length > 0
        ? tagsOver
          ? {
              status: "warn",
              label: "Tag total is over YouTube's 500-char limit",
              detail: `${tagsTotalChars} / ${TAG_TOTAL_LIMIT}`,
            }
          : {
              status: "ok",
              label: `${tags.length} tag${tags.length === 1 ? "" : "s"}`,
              detail: `${tagsTotalChars} / ${TAG_TOTAL_LIMIT} chars`,
            }
        : { status: "warn", label: "No tags added (helps reach)" }
    );
    items.push(
      accountId
        ? { status: "ok", label: "YouTube account picked", detail: channelName }
        : { status: "missing", label: "Pick a YouTube account" }
    );
    items.push(
      inFuture
        ? {
            status: "ok",
            label: "Scheduled for the future",
            detail: scheduledLabel,
          }
        : {
            status: "missing",
            label: "Pick a time at least one minute in the future",
          }
    );
    if (playlistId) {
      const pl = playlists.find((p) => p.id === playlistId);
      items.push({
        status: "ok",
        label: "Will add to playlist",
        detail: pl?.title,
      });
    }
    return items;
  }, [
    uploadedUrl,
    uploading,
    uploadProgress,
    title,
    description,
    hashtagCount,
    chapters,
    thumbUrl,
    tags,
    tagsOver,
    tagsTotalChars,
    accountId,
    channelName,
    inFuture,
    scheduledLabel,
    filename,
    playlistId,
    playlists,
  ]);

  const blockers = preflightItems.filter((p) => p.status === "missing").length;
  const canSubmit = blockers === 0 && !uploading && !submitting;

  // --- Effects ---

  useEffect(() => {
    if (!file) return;
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    if (!previewUrl) return;
    const v = document.createElement("video");
    v.src = previewUrl;
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      setDuration(Math.round(v.duration * 1000));
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!thumbFile) return;
    const url = URL.createObjectURL(thumbFile);
    setThumbPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [thumbFile]);

  // Fetch playlists when account changes
  useEffect(() => {
    if (!accountId) {
      setPlaylists([]);
      return;
    }
    let cancel = false;
    setPlaylistsLoading(true);
    fetch(`/api/tube/playlists/${accountId}`)
      .then((r) => (r.ok ? r.json() : { playlists: [] }))
      .then((j) => {
        if (cancel) return;
        setPlaylists(j.playlists ?? []);
      })
      .catch(() => {
        if (!cancel) setPlaylists([]);
      })
      .finally(() => {
        if (!cancel) setPlaylistsLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, [accountId]);

  // --- Handlers ---

  async function handleVideoChosen(f: File) {
    if (!f.type.startsWith("video/")) {
      toast.error("Pick a video file (mp4, mov, or webm).");
      return;
    }
    if (f.size > 5 * 1024 * 1024 * 1024) {
      toast.error("That file is over 5 GB. Try a smaller file.");
      return;
    }
    setFile(f);
    setFilename(f.name);
    setUploadedUrl(null);
    setUploadedSize(null);
    setUploadedCt(null);
    void uploadFile(f, false);
  }

  async function handleThumbChosen(f: File) {
    if (!f.type.startsWith("image/")) {
      toast.error("Pick an image (jpg, png, or webp).");
      return;
    }
    if (f.size > 4 * 1024 * 1024) {
      toast.error("Thumbnails must be under 4 MB.");
      return;
    }
    setThumbFile(f);
    setThumbUrl(null);
    void uploadFile(f, true);
  }

  async function uploadFile(f: File, isThumb: boolean) {
    if (isThumb) setThumbUploading(true);
    else {
      setUploading(true);
      setUploadProgress(0);
    }
    try {
      const fd = new FormData();
      fd.append("file", f);
      const xhr = new XMLHttpRequest();
      const promise = new Promise<{ url: string; size: number; contentType: string }>(
        (resolve, reject) => {
          xhr.open("POST", isThumb ? "/api/upload?kind=image" : "/api/upload");
          xhr.upload.onprogress = (e) => {
            if (!isThumb && e.lengthComputable) {
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
        }
      );
      const { url, size, contentType } = await promise;
      if (isThumb) {
        setThumbUrl(url);
      } else {
        setUploadedUrl(url);
        setUploadedSize(size);
        setUploadedCt(contentType);
      }
      toast.success(isThumb ? "Thumbnail uploaded." : "Video uploaded.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed.");
      if (isThumb) {
        setThumbFile(null);
        setThumbPreview(null);
      } else {
        setFile(null);
        setPreviewUrl(null);
      }
    } finally {
      if (isThumb) setThumbUploading(false);
      else setUploading(false);
    }
  }

  function addTag(value: string) {
    const cleaned = value.trim().replace(/^#/, "").slice(0, 60);
    if (!cleaned) return;
    if (tags.includes(cleaned)) {
      setTagInput("");
      return;
    }
    if (tags.length >= 50) {
      toast.error("YouTube only allows up to 50 tags.");
      return;
    }
    setTags((p) => [...p, cleaned]);
    setTagInput("");
  }

  function removeTag(tag: string) {
    setTags((p) => p.filter((t) => t !== tag));
  }

  async function submit() {
    if (blockers > 0) {
      toast.error(`${blockers} thing${blockers === 1 ? "" : "s"} still needed — see the pre-flight panel.`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/tube/posts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          connectionId: accountId,
          title: title.trim(),
          description,
          tags,
          categoryId,
          visibility,
          madeForKids,
          scheduledAt: scheduledIso,
          thumbnailUrl: thumbUrl,
          playlistId: playlistId || null,
          media: {
            url: uploadedUrl,
            filename: filename || "video.mp4",
            contentType: uploadedCt || "video/mp4",
            sizeBytes: uploadedSize || file?.size || 0,
            durationMs: duration,
          },
          brandId: activeBrand?.id,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Could not line it up.");
      }
      toast.success("Lined up.");
      router.push("/tube");
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
    setFilename(null);
    setThumbFile(null);
    setThumbPreview(null);
    setThumbUrl(null);
    setTitle("");
    setDescription("");
    setTags([]);
    setTagInput("");
    setPlaylistId("");
  }

  return (
    <div className="container-page py-7 pb-28 lg:pb-7 max-w-7xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Tv className="size-5 text-brand" />
            New long video
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
        <div className="hidden lg:flex gap-2">
          <Button variant="ghost" onClick={reset} disabled={submitting}>
            Clear
          </Button>
          <Button
            variant="brand"
            onClick={submit}
            disabled={!canSubmit}
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
                Schedule
              </>
            )}
          </Button>
        </div>
      </div>

      <div className="grid lg:grid-cols-[1fr_320px] gap-5">
        <div className="space-y-5 min-w-0">
          {/* YouTube preview card */}
          <TubePreviewCard
            title={title}
            channelName={channelName}
            thumbnailUrl={thumbUrl || thumbPreview}
            visibility={visibility}
            scheduledLabel={scheduledLabel}
            durationLabel={durationLabel}
          />

          {/* Video + thumbnail uploads (stacked on mobile, side-by-side on sm+) */}
          <div className="grid sm:grid-cols-[1fr_240px] gap-3">
            <Card className="p-0 overflow-hidden">
              {previewUrl ? (
                <div className="relative aspect-video bg-black">
                  <video
                    src={previewUrl}
                    className="size-full object-contain"
                    controls
                    playsInline
                    crossOrigin="anonymous"
                  />
                  {uploading ? (
                    <div className="absolute inset-x-0 bottom-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
                      <div className="flex items-center justify-between text-xs text-white mb-1.5">
                        <span>Uploading…</span>
                        <span className="font-mono">{uploadProgress}%</span>
                      </div>
                      <Progress value={uploadProgress} />
                    </div>
                  ) : null}
                  {!uploading && uploadedUrl ? (
                    <div className="absolute top-3 right-3">
                      <Badge variant="success" className="gap-1">
                        <Check className="size-3" /> Ready
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
                    if (f) void handleVideoChosen(f);
                  }}
                  className={cn(
                    "w-full aspect-video flex flex-col items-center justify-center gap-3 border-2 border-dashed transition-colors",
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
                      mp4 / mov / webm · 16:9 best · up to 5 GB
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
                if (f) void handleVideoChosen(f);
              }}
            />

            <Card className="p-0 overflow-hidden">
              <div className="px-3 py-2 border-b border-border flex items-center justify-between">
                <span className="text-xs font-medium inline-flex items-center gap-1">
                  <ImageIcon className="size-3" />
                  Thumbnail
                </span>
                {thumbUrl ? (
                  <Badge variant="success" className="gap-0.5 text-[10px]">
                    <Check className="size-2.5" /> Set
                  </Badge>
                ) : null}
              </div>
              {thumbPreview ? (
                <div className="relative aspect-video">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={thumbPreview} alt="" className="size-full object-cover" />
                  {thumbUploading ? (
                    <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-xs text-white">
                      <Loader2 className="size-4 animate-spin mr-2" />
                      Uploading…
                    </div>
                  ) : null}
                  <button
                    onClick={() => {
                      setThumbFile(null);
                      setThumbPreview(null);
                      setThumbUrl(null);
                    }}
                    className="absolute top-1.5 right-1.5 size-6 rounded bg-black/70 backdrop-blur text-white inline-flex items-center justify-center"
                    title="Remove"
                  >
                    <X className="size-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => thumbInput.current?.click()}
                  className="w-full aspect-video flex items-center justify-center gap-2 bg-surface-2/30 hover:bg-surface-2/60 transition-colors text-xs text-muted-foreground"
                >
                  <Plus className="size-3.5" />
                  Add
                </button>
              )}
              <input
                ref={thumbInput}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleThumbChosen(f);
                }}
              />
            </Card>
          </div>

          {file ? (
            <Card className="px-4 py-3 text-xs flex items-center gap-4 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Film className="size-3.5" />
                <span className="truncate font-mono text-foreground">{filename}</span>
              </span>
              {uploadedSize ? (
                <span className="text-muted-foreground">
                  Size <span className="text-foreground font-mono">{formatBytes(uploadedSize)}</span>
                </span>
              ) : null}
              {duration ? (
                <span className="text-muted-foreground">
                  Length <span className="text-foreground font-mono">{formatDuration(duration)}</span>
                </span>
              ) : null}
              <button
                onClick={() => {
                  setFile(null);
                  setPreviewUrl(null);
                  setUploadedUrl(null);
                }}
                className="ml-auto inline-flex items-center gap-1 text-destructive hover:text-destructive"
              >
                <Trash2 className="size-3.5" />
                Remove
              </button>
            </Card>
          ) : null}

          {/* Title + description */}
          <Card>
            <div className="p-5 pb-3">
              <h2 className="text-base font-semibold tracking-tight">Title and description</h2>
            </div>
            <Separator />
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="title">Title</Label>
                  <span
                    className={cn(
                      "text-xs font-mono tabular-nums",
                      title.length > 100
                        ? "text-destructive"
                        : "text-muted-foreground"
                    )}
                  >
                    {title.length} / 100
                  </span>
                </div>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value.slice(0, 100))}
                  placeholder="Write a clear, catchy title (100 chars max)"
                  maxLength={100}
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <Label htmlFor="description">Description</Label>
                  <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-muted-foreground">
                    {hashtagCount > 0 ? (
                      <span className="inline-flex items-center gap-1">
                        <Hash className="size-3" />
                        {hashtagCount}
                      </span>
                    ) : null}
                    {chapters > 0 ? (
                      <span className="inline-flex items-center gap-1 text-brand">
                        <ListVideo className="size-3" />
                        {chapters} chapters
                      </span>
                    ) : null}
                    <span
                      className={cn(
                        description.length > 5000
                          ? "text-destructive"
                          : "text-muted-foreground"
                      )}
                    >
                      {description.length} / 5000
                    </span>
                  </div>
                </div>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value.slice(0, 5000))}
                  placeholder={"What's the video about?\n\nAdd chapter timestamps like:\n00:00 Intro\n01:30 Main point\n\n#hashtags help too"}
                  rows={7}
                />
              </div>
            </div>
          </Card>

          {/* Tags */}
          <Card>
            <div className="p-5 pb-3 flex items-start justify-between gap-2 flex-wrap">
              <div>
                <h2 className="text-base font-semibold tracking-tight flex items-center gap-1.5">
                  <Tag className="size-4" />
                  Tags
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Up to 50 tags. YouTube counts every character — caps at 500 total.
                </p>
              </div>
              <span
                className={cn(
                  "text-xs font-mono tabular-nums",
                  tagsOver ? "text-destructive" : "text-muted-foreground"
                )}
              >
                {tagsTotalChars} / {TAG_TOTAL_LIMIT}
              </span>
            </div>
            <Separator />
            <div className="p-5 space-y-3">
              <div className="flex gap-2">
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag(tagInput);
                    } else if (
                      e.key === "Backspace" &&
                      !tagInput &&
                      tags.length > 0
                    ) {
                      removeTag(tags[tags.length - 1]);
                    }
                  }}
                  onBlur={() => addTag(tagInput)}
                  placeholder="add a tag…"
                />
                <Button
                  variant="outline"
                  onClick={() => addTag(tagInput)}
                  disabled={!tagInput.trim()}
                >
                  Add
                </Button>
              </div>
              {tags.length > 0 ? (
                <div className="flex flex-wrap gap-1.5">
                  {tags.map((t) => (
                    <button
                      key={t}
                      onClick={() => removeTag(t)}
                      className="inline-flex items-center gap-1 rounded-full bg-surface-2 border border-border px-2 py-0.5 text-xs hover:bg-surface-3"
                      title="Remove"
                    >
                      <span>{t}</span>
                      <X className="size-2.5 text-muted-foreground" />
                    </button>
                  ))}
                  <span className="text-xs text-subtle-foreground tabular-nums ml-1 self-center">
                    {tags.length} / 50
                  </span>
                </div>
              ) : null}
            </div>
          </Card>

          {/* Settings */}
          <Card>
            <div className="p-5 pb-3">
              <h2 className="text-base font-semibold tracking-tight">Settings</h2>
            </div>
            <Separator />
            <div className="p-5 grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Category</Label>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {YOUTUBE_CATEGORIES.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>YouTube account</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.accountName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Playlist (optional)</Label>
                <Select
                  value={playlistId || "__none"}
                  onValueChange={(v) => setPlaylistId(v === "__none" ? "" : v)}
                >
                  <SelectTrigger>
                    <SelectValue
                      placeholder={
                        playlistsLoading
                          ? "Loading playlists…"
                          : "Don't add to a playlist"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">Don't add to a playlist</SelectItem>
                    {playlists.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.title}
                        {p.count > 0 ? ` · ${p.count}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!playlistsLoading && playlists.length === 0 && accountId ? (
                  <p className="text-xs text-subtle-foreground">
                    No playlists found on this channel.
                  </p>
                ) : null}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Who can see it</Label>
                <div className="grid grid-cols-3 gap-2">
                  <VisibilityOption
                    label="Public"
                    description="Anyone can find and watch"
                    icon={Globe}
                    active={visibility === "public"}
                    onClick={() => setVisibility("public")}
                  />
                  <VisibilityOption
                    label="Unlisted"
                    description="Only people with the link"
                    icon={EyeOff}
                    active={visibility === "unlisted"}
                    onClick={() => setVisibility("unlisted")}
                  />
                  <VisibilityOption
                    label="Private"
                    description="Only you"
                    icon={Lock}
                    active={visibility === "private"}
                    onClick={() => setVisibility("private")}
                  />
                </div>
              </div>
              <div className="sm:col-span-2 flex items-start justify-between gap-3 rounded-md border border-border p-3">
                <div>
                  <div className="text-sm font-medium">Made for kids?</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    YouTube needs to know if this is for children. Comments and
                    a few features turn off if you say yes.
                  </div>
                </div>
                <Switch checked={madeForKids} onCheckedChange={setMadeForKids} />
              </div>
            </div>
          </Card>

          {/* When to post */}
          <Card>
            <div className="p-5 pb-3">
              <h2 className="text-base font-semibold tracking-tight">When to post</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Date and time in your local zone. We post it then.
              </p>
            </div>
            <Separator />
            <div className="p-5 flex flex-wrap items-center gap-3">
              <div className="relative">
                <Calendar className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="date"
                  value={date}
                  min={toDateInput(new Date())}
                  onChange={(e) => setDate(e.target.value)}
                  className="h-10 rounded-md border border-border bg-surface pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:border-brand/60 [color-scheme:dark]"
                />
              </div>
              <div className="relative">
                <Clock className="size-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="h-10 rounded-md border border-border bg-surface pl-8 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:border-brand/60 [color-scheme:dark]"
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                {scheduledLabel}
              </span>
            </div>
          </Card>

          <div className="rounded-md bg-surface/40 border border-border px-4 py-3 flex items-start gap-2.5">
            <Info className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Long videos can take a while to upload to YouTube. If a post
              hiccups we keep trying for up to 30 minutes.
            </p>
          </div>
        </div>

        {/* Sticky right column: pre-flight panel */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 space-y-4">
            <TubePreflight items={preflightItems} />
          </div>
        </aside>
      </div>

      {/* Sticky mobile submit bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-xl px-4 py-3 flex items-center gap-2">
        <div className="flex-1 text-xs text-muted-foreground">
          <span className="font-mono tabular-nums text-foreground">
            {preflightItems.filter((p) => p.status === "ok").length} / {preflightItems.length}
          </span>
          {" "}ready
        </div>
        <Button variant="ghost" size="sm" onClick={reset} disabled={submitting}>
          Clear
        </Button>
        <Button
          variant="brand"
          onClick={submit}
          disabled={!canSubmit}
          className="gap-1.5"
        >
          {submitting ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Zap className="size-4" />
          )}
          Schedule
        </Button>
      </div>
    </div>
  );
}

function VisibilityOption({
  label,
  description,
  icon: Icon,
  active,
  onClick,
}: {
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      type="button"
      className={cn(
        "text-left rounded-md border p-3 transition-colors",
        active
          ? "border-brand bg-brand/[0.05]"
          : "border-border hover:border-border-strong bg-surface-2/30"
      )}
    >
      <Icon
        className={cn("size-4 mb-1.5", active ? "text-brand" : "text-muted-foreground")}
      />
      <div className="text-sm font-medium">{label}</div>
      <div className="text-xs text-muted-foreground mt-0.5 leading-tight">
        {description}
      </div>
    </button>
  );
}

// --- helpers ---

function detectChapters(description: string): number {
  // Lines like "00:00 Intro" or "01:23:45 Whatever" — YouTube auto-detects
  // when the first one is at 00:00 and they're in ascending order.
  const lines = description.split("\n");
  let count = 0;
  let lastSec = -1;
  let sawZero = false;
  for (const line of lines) {
    const m = line.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s+\S+/);
    if (!m) continue;
    const h = m[3] ? Number(m[1]) : 0;
    const mn = Number(m[3] ? m[2] : m[1]);
    const s = Number(m[3] ? m[3] : m[2]);
    const total = h * 3600 + mn * 60 + s;
    if (count === 0) {
      if (total !== 0) return 0;
      sawZero = true;
    }
    if (total <= lastSec) return 0;
    lastSec = total;
    count++;
  }
  return sawZero && count >= 3 ? count : 0;
}

function nextMorning(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(10, 0, 0, 0);
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
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

function labelFromIso(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  let day = d.toLocaleDateString("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
  if (sameDay(d, today)) day = "Today";
  else if (sameDay(d, tomorrow)) day = "Tomorrow";
  const time = d.toLocaleTimeString("en", { hour: "numeric", minute: "2-digit" });
  return `${day}, ${time}`;
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
