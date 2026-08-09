/**
 * FULL LOAD v2 — corrected pipeline.
 *
 * Per post:  get file (local, else download from Drive with the confirm=t form)
 *         -> probe codec: H.264 => LOSSLESS remux to .mp4, HEVC/other => re-encode CRF18
 *         -> presigned upload straight to Blotato (no Blob, no Drive sharing)
 *         -> VERIFY the media URL really resolves (HTTP 200) BEFORE scheduling
 *         -> create one scheduled post per platform, recording submission ids.
 *
 * Skips: the 4 past-date posts, and anything already confirmed working.
 *   pnpm tsx scripts/_blotato_load2.ts [--dry]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fromZonedTime } from "date-fns-tz";

const SCRATCH =
  "C:/Users/naamd/AppData/Local/Temp/claude/C--Users-naamd-OneDrive-Documents-Road-Runner/e75c7e96-35f2-4305-9d47-d151f00cc01c/scratchpad";
const WORK = `${SCRATCH}/media`;
const KEY = readFileSync(`${SCRATCH}/blotato_key.txt`, "utf8").trim();
const LOCAL: Record<string, string> = JSON.parse(readFileSync(`${SCRATCH}/local_media.json`, "utf8"));
const FEED = "C:/Users/naamd/Downloads/roadrunner_posts_1.json";
const LEDGER = `${SCRATCH}/ledger_v2.json`;
const BASE = "https://backend.blotato.com/v2";
const H = { "blotato-api-key": KEY, "Content-Type": "application/json" };
const DRY = process.argv.includes("--dry");

const ACCTS: Record<string, string> = {
  facebook: "45377", youtube: "46053", instagram: "63791", tiktok: "54560",
};
const FB_PAGE = "294901880521177";
const PLATFORMS = ["facebook", "youtube", "instagram", "tiktok"] as const;

/** Dates already gone — user said skip. */
const SKIP_PAST = new Set([1, 2, 3, 5]);
/** Queue was wiped to clear ~184 broken posts, so nothing pre-exists now. */
const ALREADY: Record<number, string[]> = {};

type FeedPost = {
  id: number; post_date: string; scheduled_time_local: string; timezone: string;
  title: string; caption_full: string; youtube_title: string;
  video_filename: string | null; video_drive_file_id: string | null;
};
type Entry = { media?: string; done: Record<string, string> };

if (!existsSync(WORK)) mkdirSync(WORK, { recursive: true });
const ledger: Record<string, Entry> = existsSync(LEDGER)
  ? JSON.parse(readFileSync(LEDGER, "utf8")) : {};
for (const [id, plats] of Object.entries(ALREADY)) {
  ledger[id] = ledger[id] ?? { done: {} };
  for (const p of plats) ledger[id].done[p] = ledger[id].done[p] ?? "pre-existing";
}
const save = () => writeFileSync(LEDGER, JSON.stringify(ledger, null, 1));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Download a publicly-shared Drive file using the documented confirm=t form. */
async function fetchDrive(fid: string, dest: string): Promise<boolean> {
  const url = `https://drive.usercontent.google.com/download?id=${fid}&export=download&confirm=t`;
  const r = await fetch(url);
  if (!r.ok) return false;
  const ct = r.headers.get("content-type") || "";
  if (ct.includes("text/html")) return false; // sign-in / scan page, not the file
  writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
  return statSync(dest).size > 10000;
}

/** Normalise to H.264 MP4 — losslessly when the source is already H.264. */
function toMp4(src: string, out: string): "remux" | "encode" {
  const probe = JSON.parse(
    execFileSync("ffprobe", ["-v", "quiet", "-print_format", "json", "-show_streams", src], {
      encoding: "utf8", maxBuffer: 1 << 24,
    })
  ) as { streams: Array<{ codec_type: string; codec_name?: string }> };
  const v = probe.streams.find((s) => s.codec_type === "video");
  const isH264 = v?.codec_name === "h264";
  if (isH264) {
    // container swap only: not a single frame is re-encoded
    execFileSync("ffmpeg", ["-y", "-i", src, "-c", "copy", "-movflags", "+faststart", out], { stdio: "ignore" });
    return "remux";
  }
  execFileSync("ffmpeg", ["-y", "-i", src, "-c:v", "libx264", "-preset", "slow", "-crf", "18",
    "-vf", "scale='min(1080,iw)':-2", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
    "-movflags", "+faststart", out], { stdio: "ignore" });
  return "encode";
}

/** Upload the file to Blotato and return a media URL that is PROVEN to resolve. */
async function uploadVerified(file: string, id: number): Promise<string | null> {
  const pres = await fetch(`${BASE}/media/uploads`, {
    method: "POST", headers: H, body: JSON.stringify({ filename: `post${id}.mp4` }),
  });
  const j = (await pres.json()) as { presignedUrl?: string; publicUrl?: string };
  if (!j.presignedUrl || !j.publicUrl) return null;
  const put = await fetch(j.presignedUrl, {
    method: "PUT", headers: { "Content-Type": "video/mp4" }, body: readFileSync(file),
  });
  if (!put.ok) return null;
  // THE CHECK THAT WAS MISSING: confirm the media is really fetchable.
  for (let i = 0; i < 5; i++) {
    const v = await fetch(j.publicUrl);
    if (v.ok && (v.headers.get("content-type") || "").includes("video")) return j.publicUrl;
    await sleep(2000);
  }
  return null;
}

function target(platform: string, p: FeedPost) {
  const t = `${p.youtube_title.slice(0, 91)} #Shorts`;
  if (platform === "facebook") return { targetType: "facebook", pageId: FB_PAGE, mediaType: "reel" };
  if (platform === "youtube")
    return { targetType: "youtube", title: t, privacyStatus: "public", shouldNotifySubscribers: false };
  if (platform === "instagram") return { targetType: "instagram", mediaType: "reel" };
  return { targetType: "tiktok", privacyLevel: "PUBLIC_TO_EVERYONE", disabledComments: false,
    disabledDuet: false, disabledStitch: false, isBrandedContent: false, isYourBrand: false, isAiGenerated: false };
}

async function main() {
  const feed = JSON.parse(readFileSync(FEED, "utf8")) as { posts: FeedPost[] };
  const todo = feed.posts.filter((p) => p.video_drive_file_id && !SKIP_PAST.has(p.id));
  console.log(`${todo.length} posts to process (skipping ${SKIP_PAST.size} past-date). dry=${DRY}\n`);

  let made = 0; const problems: string[] = [];

  for (const p of todo) {
    const e = (ledger[p.id] = ledger[p.id] ?? { done: {} });
    const missing = PLATFORMS.filter((pl) => !e.done[pl]);
    if (missing.length === 0) { console.log(`[${p.id}] complete — skip`); continue; }
    const when = fromZonedTime(`${p.post_date} ${p.scheduled_time_local}:00`, p.timezone).toISOString();
    if (DRY) { console.log(`[${p.id}] ${p.post_date} -> ${missing.join(",")}`); continue; }

    // --- media ---
    if (!e.media) {
      const raw = LOCAL[String(p.id)] ?? `${WORK}/${p.id}.src`;
      if (!LOCAL[String(p.id)]) {
        const got = await fetchDrive(p.video_drive_file_id!, raw);
        if (!got) { problems.push(`#${p.id} download failed (likely private/large)`); console.log(`[${p.id}] ✗ download`); continue; }
      }
      const mp4 = `${WORK}/${p.id}.mp4`;
      let mode: string;
      try { mode = toMp4(raw, mp4); }
      catch { problems.push(`#${p.id} ffmpeg failed`); console.log(`[${p.id}] ✗ ffmpeg`); continue; }
      const url = await uploadVerified(mp4, p.id);
      if (!url) { problems.push(`#${p.id} upload/verify failed`); console.log(`[${p.id}] ✗ upload`); continue; }
      e.media = url; save();
      console.log(`[${p.id}] media ok (${mode}, ${(statSync(mp4).size / 1e6).toFixed(1)}MB)`);
    }

    // --- posts ---
    for (const pl of missing) {
      const body = JSON.stringify({
        post: { accountId: ACCTS[pl], content: { text: p.caption_full, mediaUrls: [e.media], platform: pl }, target: target(pl, p) },
        scheduledTime: when,
      });
      // Blotato allows 30 requests/min, so pace at ~2.1s and back off hard on 429.
      let done = false;
      for (let attempt = 0; attempt < 4 && !done; attempt++) {
        const r = await fetch(`${BASE}/posts`, { method: "POST", headers: H, body });
        const txt = await r.text();
        if (r.ok) {
          e.done[pl] = (JSON.parse(txt) as { postSubmissionId: string }).postSubmissionId;
          save(); made++; done = true;
        } else if (r.status === 429) {
          await sleep(20000 * (attempt + 1));
        } else {
          problems.push(`#${p.id} ${pl} ${r.status} ${txt.slice(0, 80)}`); done = true;
        }
      }
      if (!done) problems.push(`#${p.id} ${pl} rate-limited after retries`);
      await sleep(2100);
    }
    console.log(`[${p.id}] ${p.post_date} ✓ ${missing.filter((x) => e.done[x]).join(",")}  ${p.title.slice(0, 40)}`);
  }

  console.log(`\nDONE  created=${made}  problems=${problems.length}`);
  problems.forEach((x) => console.log("  !", x));
}
main().catch((e) => { console.error(e); process.exit(1); });
