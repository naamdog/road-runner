"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Calendar,
  Check,
  Clock,
  Film,
  Globe,
  Image as ImageIcon,
  Info,
  Loader2,
  Lock,
  Plus,
  Tag,
  Trash2,
  Tv,
  Upload,
  X,
  Zap,
  EyeOff,
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

export function TubeComposeForm({ accounts, activeBrand, timezone }: Props) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const thumbInput = useRef<HTMLInputElement>(null);

  // Video
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadedUrl, setUploadedUrl] = useState<string | null>(null);
  const [uploadedSize, setUploadedSize] = useState<number | null>(null);
  const [uploadedCt, setUploadedCt] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);

  // Thumbnail
  const [thumbFile, setThumbFile] = useState<File | null>(null);
  const [thumbPreview, setThumbPreview] = useState<string | null>(null);
  const [thumbUploading, setThumbUploading] = useState(false);
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  // Form
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

  const [submitting, setSubmitting] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Generate preview
  useEffect(() => {
    if (!file) return;
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

  // Thumb preview
  useEffect(() => {
    if (!thumbFile) return;
    const url = URL.createObjectURL(thumbFile);
    setThumbPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [thumbFile]);

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
    if (f.size > 2 * 1024 * 1024) {
      toast.error("Thumbnails must be under 2 MB.");
      return;
    }
    setThumbFile(f);
    setThumbUrl(null);
    void uploadFile(f, true);
  }

  async function uploadFile(f: File, isThumb: boolean) {
    if (isThumb) {
      setThumbUploading(true);
    } else {
      setUploading(true);
      setUploadProgress(0);
    }
    try {
      const fd = new FormData();
      fd.append("file", f);
      const xhr = new XMLHttpRequest();
      const promise = new Promise<{
        url: string;
        size: number;
        contentType: string;
      }>((resolve, reject) => {
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
      });
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
    if (!uploadedUrl) {
      toast.error("Wait for the video to finish uploading.");
      return;
    }
    if (!title.trim()) {
      toast.error("Add a title.");
      return;
    }
    if (!accountId) {
      toast.error("Pick a YouTube account.");
      return;
    }
    const iso = localToIso(date, time);
    if (new Date(iso).getTime() <= Date.now() + 60_000) {
      toast.error("Pick a time at least one minute in the future.");
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
          scheduledAt: iso,
          thumbnailUrl: thumbUrl,
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
  }

  return (
    <div className="container-page py-7 max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-6">
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
        <div className="flex gap-2">
          <Button variant="ghost" onClick={reset} disabled={submitting}>
            Clear
          </Button>
          <Button
            variant="brand"
            onClick={submit}
            disabled={submitting || uploading || !uploadedUrl}
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

      <div className="grid lg:grid-cols-[360px_1fr] gap-5">
        {/* Video + thumbnail */}
        <div className="space-y-4">
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
                    or tap to pick · mp4 / mov / webm · 16:9 works best · up to 5 GB
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

          {file ? (
            <Card className="p-4 text-xs space-y-1.5">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Film className="size-3.5" />
                <span className="truncate font-mono text-foreground">{filename}</span>
              </div>
              {uploadedSize ? (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Size</span>
                  <span className="font-mono text-foreground">{formatBytes(uploadedSize)}</span>
                </div>
              ) : null}
              {duration ? (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Length</span>
                  <span className="font-mono text-foreground">{formatDuration(duration)}</span>
                </div>
              ) : null}
              <Separator className="my-2" />
              <button
                onClick={() => {
                  setFile(null);
                  setPreviewUrl(null);
                  setUploadedUrl(null);
                }}
                className="flex items-center gap-1.5 text-destructive hover:text-destructive text-xs"
              >
                <Trash2 className="size-3.5" />
                Remove
              </button>
            </Card>
          ) : null}

          {/* Thumbnail */}
          <Card className="p-0 overflow-hidden">
            <div className="p-4 pb-2 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold flex items-center gap-1.5">
                  <ImageIcon className="size-3.5" />
                  Thumbnail
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Optional but recommended.
                </p>
              </div>
              {thumbUrl ? (
                <Badge variant="success" className="gap-1">
                  <Check className="size-2.5" /> Ready
                </Badge>
              ) : null}
            </div>
            {thumbPreview ? (
              <div className="relative aspect-video border-t border-border">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={thumbPreview}
                  alt=""
                  className="size-full object-cover"
                />
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
                  className="absolute top-2 right-2 size-7 rounded-md bg-black/70 backdrop-blur text-white inline-flex items-center justify-center"
                  title="Remove"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => thumbInput.current?.click()}
                className="w-full aspect-video flex items-center justify-center gap-2 border-t border-border bg-surface-2/30 hover:bg-surface-2/60 transition-colors text-sm text-muted-foreground"
              >
                <Plus className="size-4" />
                Add thumbnail
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

        {/* Form */}
        <div className="space-y-5">
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
                <div className="flex items-center justify-between">
                  <Label htmlFor="description">Description</Label>
                  <span
                    className={cn(
                      "text-xs font-mono tabular-nums",
                      description.length > 5000
                        ? "text-destructive"
                        : "text-muted-foreground"
                    )}
                  >
                    {description.length} / 5000
                  </span>
                </div>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) =>
                    setDescription(e.target.value.slice(0, 5000))
                  }
                  placeholder="What's the video about? Add links, chapters, anything that helps people find it."
                  rows={6}
                />
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-5 pb-3">
              <h2 className="text-base font-semibold tracking-tight flex items-center gap-1.5">
                <Tag className="size-4" />
                Tags
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Up to 50 tags, comma-separated. Press Enter to add each one.
              </p>
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
              <div className="space-y-1.5 sm:col-span-2 flex items-start justify-between gap-3 rounded-md border border-border p-3">
                <div>
                  <div className="text-sm font-medium">Made for kids?</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    YouTube needs to know if this is for children. Comments and
                    a few features turn off if you say yes.
                  </div>
                </div>
                <Switch
                  checked={madeForKids}
                  onCheckedChange={setMadeForKids}
                />
              </div>
            </div>
          </Card>

          <Card>
            <div className="p-5 pb-3">
              <h2 className="text-base font-semibold tracking-tight">When to post</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pick a date and time in your local zone. We post it then.
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
            </div>
          </Card>

          <div className="rounded-md bg-surface/40 border border-border px-4 py-3 flex items-start gap-2.5">
            <Info className="size-4 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              Long videos can take a while to upload to YouTube. We'll keep
              trying for up to 30 minutes if a post hiccups.
            </p>
          </div>
        </div>
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
      <Icon className={cn("size-4 mb-1.5", active ? "text-brand" : "text-muted-foreground")} />
      <div className="text-sm font-medium">{label}</div>
      <div className="text-xs text-muted-foreground mt-0.5 leading-tight">
        {description}
      </div>
    </button>
  );
}

// helpers

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
