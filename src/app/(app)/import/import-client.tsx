"use client";

import { useMemo, useRef, useState } from "react";
import { Upload, CheckCircle2, AlertTriangle, Loader2, FileVideo } from "lucide-react";
import { Card } from "@/components/ui/card";
import { PLATFORM_COLOR, PLATFORM_LABEL, type Platform } from "@/lib/blotato-shared";
import { cn } from "@/lib/utils";

const ALL: Platform[] = ["instagram", "youtube", "tiktok", "facebook"];

interface Row {
  date: string;      // YYYY-MM-DD
  time: string;      // HH:MM (London)
  filename: string;
  caption: string;
  title: string;
}
type Status = "waiting" | "uploading" | "scheduling" | "done" | "error" | "skipped";
interface RowState extends Row {
  status: Status;
  detail: string;
  file?: File;
}

/** London is UTC+1 from late March to late October, otherwise UTC. */
function londonToIso(date: string, time: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // Compare the wall-clock London render of this instant against what we asked
  // for, and shift by the difference. Handles BST/GMT without a date library.
  const shown = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(guess));
  const [sh, sm] = shown.split(":").map(Number);
  const driftMin = (sh * 60 + sm) - (hh * 60 + mm);
  return new Date(guess - driftMin * 60000).toISOString();
}

/** Accepts the roadrunner_posts JSON shape or a simple CSV. */
function parseFeed(text: string): { rows: Row[]; error: string | null } {
  const t = text.trim();
  if (!t) return { rows: [], error: null };

  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      const parsed = JSON.parse(t) as unknown;
      const arr = (Array.isArray(parsed) ? parsed : (parsed as { posts?: unknown[] }).posts) ?? [];
      const rows = (arr as Array<Record<string, string>>).map((p) => ({
        date: p.post_date ?? p.date ?? "",
        time: p.scheduled_time_local ?? p.time ?? "17:00",
        filename: p.video_filename ?? p.filename ?? "",
        caption: p.caption_full ?? p.caption ?? "",
        title: p.youtube_title ?? p.title ?? "",
      }));
      return { rows: rows.filter((r) => r.date && r.filename), error: null };
    } catch {
      return { rows: [], error: "That JSON didn't parse." };
    }
  }

  const lines = t.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return { rows: [], error: "Need a header row plus at least one row." };
  const head = splitCsv(lines[0]).map((h) => h.trim().toLowerCase());
  const idx = (...names: string[]) => head.findIndex((h) => names.includes(h));
  const iDate = idx("date", "post_date");
  const iFile = idx("filename", "video_filename", "file");
  const iCap = idx("caption", "caption_full");
  if (iDate < 0 || iFile < 0) {
    return { rows: [], error: "CSV needs at least 'date' and 'filename' columns." };
  }
  const iTime = idx("time", "scheduled_time_local");
  const iTitle = idx("title", "youtube_title");
  const rows = lines.slice(1).map((l) => {
    const c = splitCsv(l);
    return {
      date: (c[iDate] ?? "").trim(),
      time: (iTime >= 0 ? c[iTime] : "")?.trim() || "17:00",
      filename: (c[iFile] ?? "").trim(),
      caption: (iCap >= 0 ? c[iCap] : "")?.trim() ?? "",
      title: (iTitle >= 0 ? c[iTitle] : "")?.trim() ?? "",
    };
  });
  return { rows: rows.filter((r) => r.date && r.filename), error: null };
}

/** Minimal CSV splitter that respects quoted fields. */
function splitCsv(line: string): string[] {
  const out: string[] = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ;
    } else if (ch === "," && !inQ) { out.push(cur); cur = ""; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

export function ImportClient() {
  const [feed, setFeed] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([...ALL]);
  const [rows, setRows] = useState<RowState[] | null>(null);
  const [running, setRunning] = useState(false);
  const fileInput = useRef<HTMLInputElement | null>(null);

  const parsed = useMemo(() => parseFeed(feed), [feed]);

  const matched = useMemo(() => {
    const byName = new Map(files.map((f) => [f.name.toLowerCase(), f]));
    return parsed.rows.map((r) => {
      // Match on exact name first, then ignoring the extension — the sheet often
      // says .mov while the converted file on disk is .mp4.
      const want = r.filename.toLowerCase();
      const stem = want.replace(/\.[^.]+$/, "");
      const file =
        byName.get(want) ??
        files.find((f) => f.name.toLowerCase().replace(/\.[^.]+$/, "") === stem);
      return { ...r, file };
    });
  }, [parsed.rows, files]);

  const ready = matched.filter((m) => m.file && /\.mp4$/i.test(m.file.name)).length;
  const missing = matched.filter((m) => !m.file).length;
  const wrongType = matched.filter((m) => m.file && !/\.mp4$/i.test(m.file.name)).length;

  async function run() {
    setRunning(true);
    const initial: RowState[] = matched.map((m) => ({
      ...m,
      status: m.file ? (/\.mp4$/i.test(m.file.name) ? "waiting" : "skipped") : "skipped",
      detail: m.file ? (/\.mp4$/i.test(m.file.name) ? "" : "not an .mp4") : "no matching file",
    }));
    setRows(initial);
    const next = [...initial];
    const update = (i: number, patch: Partial<RowState>) => {
      next[i] = { ...next[i], ...patch };
      setRows([...next]);
    };

    for (let i = 0; i < next.length; i++) {
      const row = next[i];
      if (row.status === "skipped" || !row.file) continue;
      try {
        update(i, { status: "uploading", detail: "getting upload link…" });
        const pres = await fetch("/api/import/presign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ filename: row.file.name }),
        });
        if (!pres.ok) throw new Error((await pres.json()).error ?? "presign failed");
        const { presignedUrl, publicUrl } = (await pres.json()) as {
          presignedUrl: string; publicUrl: string;
        };

        update(i, { detail: `uploading ${(row.file.size / 1e6).toFixed(0)}MB…` });
        // Straight to Blotato — never through our own server.
        const put = await fetch(presignedUrl, {
          method: "PUT",
          headers: { "Content-Type": "video/mp4" },
          body: row.file,
        });
        if (!put.ok) throw new Error(`upload failed (${put.status})`);

        update(i, { status: "scheduling", detail: "scheduling…" });
        const sched = await fetch("/api/import/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mediaUrl: publicUrl,
            caption: row.caption,
            title: row.title || row.caption.split("\n")[0],
            when: londonToIso(row.date, row.time),
            platforms,
          }),
        });
        const out = (await sched.json()) as {
          results?: Array<{ platform: string; ok: boolean; error?: string }>;
          error?: string;
        };
        if (!sched.ok) throw new Error(out.error ?? "scheduling failed");
        const bad = (out.results ?? []).filter((r) => !r.ok);
        if (bad.length) {
          update(i, {
            status: "error",
            detail: bad.map((b) => `${b.platform}: ${b.error}`).join(" · "),
          });
        } else {
          update(i, { status: "done", detail: `scheduled on ${platforms.length} platforms` });
        }
      } catch (e) {
        update(i, { status: "error", detail: e instanceof Error ? e.message : "failed" });
      }
    }
    setRunning(false);
  }

  const done = rows?.filter((r) => r.status === "done").length ?? 0;
  const failed = rows?.filter((r) => r.status === "error").length ?? 0;

  return (
    <div className="space-y-4">
      {/* 1. the schedule */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold">1. Paste your schedule</h2>
        <p className="text-xs text-muted-foreground mt-1">
          A CSV with <code className="text-foreground">date</code> and{" "}
          <code className="text-foreground">filename</code> columns (plus optional{" "}
          <code className="text-foreground">time</code>, <code className="text-foreground">caption</code>,{" "}
          <code className="text-foreground">title</code>), or the roadrunner_posts JSON.
          Times are UK time; blank means 17:00.
        </p>
        <textarea
          value={feed}
          onChange={(e) => setFeed(e.target.value)}
          rows={5}
          spellCheck={false}
          placeholder={"date,time,filename,caption,title\n2026-12-01,17:00,my-reel.mp4,Caption here,Title here"}
          className="mt-3 w-full rounded-md border border-border bg-surface p-3 text-xs font-mono outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
        />
        {parsed.error ? (
          <p className="text-xs text-destructive mt-2">{parsed.error}</p>
        ) : parsed.rows.length ? (
          <p className="text-xs text-muted-foreground mt-2">
            Read <span className="text-foreground font-medium">{parsed.rows.length}</span> rows.
          </p>
        ) : null}
      </Card>

      {/* 2. the videos */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold">2. Pick the videos</h2>
        <p className="text-xs text-muted-foreground mt-1">
          Select them all at once — they&apos;re matched to rows by filename, and
          uploaded straight to Blotato from your browser. Must be .mp4.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="video/mp4,video/*"
          multiple
          onChange={(e) => setFiles([...(e.target.files ?? [])])}
          className="hidden"
        />
        <button
          onClick={() => fileInput.current?.click()}
          className="mt-3 inline-flex items-center gap-2 h-9 px-3 rounded-md border border-border bg-surface-2 text-sm hover:border-border-strong transition-colors"
        >
          <Upload className="size-4" />
          Choose videos
        </button>
        {files.length ? (
          <p className="text-xs text-muted-foreground mt-2">
            <span className="text-foreground font-medium">{files.length}</span> files selected
          </p>
        ) : null}
      </Card>

      {/* 3. platforms */}
      <Card className="p-5">
        <h2 className="text-sm font-semibold">3. Post to</h2>
        <div className="flex gap-2 mt-3 flex-wrap">
          {ALL.map((p) => {
            const on = platforms.includes(p);
            return (
              <button
                key={p}
                onClick={() =>
                  setPlatforms((cur) => (on ? cur.filter((x) => x !== p) : [...cur, p]))
                }
                aria-pressed={on}
                className={cn(
                  "h-8 px-3 rounded-full text-xs font-medium border inline-flex items-center gap-1.5 transition-colors",
                  on
                    ? "bg-surface-2 text-foreground border-border-strong"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                <span className="size-1.5 rounded-full" style={{ background: PLATFORM_COLOR[p] }} />
                {PLATFORM_LABEL[p]}
              </button>
            );
          })}
        </div>
      </Card>

      {/* summary + go */}
      {parsed.rows.length > 0 ? (
        <Card className="p-5">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="text-sm">
              <span className="text-foreground font-medium">{ready}</span> ready
              {missing ? <span className="text-warning"> · {missing} with no matching file</span> : null}
              {wrongType ? <span className="text-destructive"> · {wrongType} not .mp4</span> : null}
              <div className="text-xs text-muted-foreground mt-1">
                {ready * platforms.length} posts will be created.
              </div>
            </div>
            <button
              onClick={run}
              disabled={running || ready === 0 || platforms.length === 0}
              className="h-9 px-4 rounded-md bg-brand text-brand-foreground text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-brand-muted transition-colors inline-flex items-center gap-2"
            >
              {running ? <Loader2 className="size-4 animate-spin" /> : null}
              {running ? "Working…" : `Schedule ${ready} videos`}
            </button>
          </div>
        </Card>
      ) : null}

      {/* progress */}
      {rows ? (
        <Card className="overflow-hidden">
          <div className="px-5 py-3 border-b border-border flex items-center gap-3">
            <span className="text-sm font-medium">Progress</span>
            <span className="text-xs text-muted-foreground tabular-nums">
              {done} done{failed ? ` · ${failed} failed` : ""} of {rows.length}
            </span>
          </div>
          <ul className="divide-y divide-border max-h-[28rem] overflow-y-auto">
            {rows.map((r, i) => (
              <li key={i} className="flex items-start gap-3 px-5 py-3">
                <StatusIcon status={r.status} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm truncate">
                    <span className="tabular-nums text-muted-foreground mr-2">{r.date}</span>
                    {r.filename}
                  </div>
                  {r.detail ? (
                    <div
                      className={cn(
                        "text-xs mt-0.5",
                        r.status === "error" ? "text-destructive"
                          : r.status === "skipped" ? "text-warning"
                          : "text-muted-foreground"
                      )}
                    >
                      {r.detail}
                    </div>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

function StatusIcon({ status }: { status: Status }) {
  if (status === "done") return <CheckCircle2 className="size-4 text-success mt-0.5 shrink-0" />;
  if (status === "error") return <AlertTriangle className="size-4 text-destructive mt-0.5 shrink-0" />;
  if (status === "skipped") return <AlertTriangle className="size-4 text-warning mt-0.5 shrink-0" />;
  if (status === "waiting") return <FileVideo className="size-4 text-muted-foreground mt-0.5 shrink-0" />;
  return <Loader2 className="size-4 text-brand animate-spin mt-0.5 shrink-0" />;
}
