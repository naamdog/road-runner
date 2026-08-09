"use client";

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/** Route the clip through our proxy so it arrives as real video/mp4. */
export function proxied(url: string): string {
  return `/api/media?u=${encodeURIComponent(url)}`;
}

/**
 * A poster frame that opens the clip in a lightbox.
 *
 * The <video> is only ever asked for metadata — the proxy forwards Range, so
 * painting the first frame costs a few KB rather than the whole file. The full
 * clip loads only once someone actually opens it.
 */
export function VideoThumb({
  url,
  className,
  caption,
}: {
  url: string | null;
  className?: string;
  caption?: string;
}) {
  const [open, setOpen] = useState(false);
  const posterRef = useRef<HTMLVideoElement | null>(null);

  /**
   * Chrome treats `preload="metadata"` as advisory and here declined to load at
   * all (readyState stayed 0, no request ever made), so posters never appeared.
   * Calling load() explicitly once the row scrolls into view forces it — and
   * keeps the list lazy, which is what stopped the tab freezing earlier.
   */
  useEffect(() => {
    const el = posterRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.load();
            io.disconnect();
          }
        }
      },
      { rootMargin: "200px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [url]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    // Stop the page scrolling behind the overlay.
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!url) {
    return (
      <div
        className={cn(
          "bg-surface-3 border border-border grid place-items-center text-[10px] text-muted-foreground",
          className
        )}
      >
        no video
      </div>
    );
  }

  const src = proxied(url);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Play video"
        className={cn(
          "relative overflow-hidden bg-surface-3 border border-border group cursor-pointer transition-colors hover:border-brand/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50",
          className
        )}
      >
        {/*
          `preload="metadata"` loads the header but never decodes a frame, so the
          box stays blank. Seeking once metadata arrives forces exactly one frame
          to decode — a couple of extra range requests, and a real poster.
        */}
        <video
          ref={posterRef}
          src={src}
          muted
          playsInline
          preload="metadata"
          tabIndex={-1}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget;
            try {
              if (v.currentTime === 0) v.currentTime = Math.min(0.5, (v.duration || 1) / 2);
            } catch {
              /* seeking unsupported — the play affordance still works */
            }
          }}
          className="absolute inset-0 size-full object-cover pointer-events-none"
        />
        <span className="absolute inset-0 grid place-items-center bg-black/25 group-hover:bg-black/10 transition-colors">
          <span className="size-7 rounded-full bg-black/60 backdrop-blur-sm grid place-items-center ring-1 ring-white/25 group-hover:scale-110 transition-transform">
            <svg viewBox="0 0 24 24" className="size-3.5 translate-x-[1px] text-white" aria-hidden>
              <path fill="currentColor" d="M8 5.5v13a1 1 0 0 0 1.53.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5Z" />
            </svg>
          </span>
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Video preview"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm grid place-items-center p-4 animate-in fade-in duration-150"
        >
          <div
            className="relative w-full max-w-[min(420px,90vw)]"
            onClick={(e) => e.stopPropagation()}
          >
            <video
              src={src}
              controls
              autoPlay
              playsInline
              className="w-full rounded-xl border border-border-strong bg-black shadow-2xl aspect-[9/16] object-contain"
            />
            {caption ? (
              <p className="mt-3 text-xs text-white/70 leading-relaxed line-clamp-3">{caption}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute top-4 right-4 size-9 rounded-full bg-white/10 hover:bg-white/20 grid place-items-center text-white transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : null}
    </>
  );
}
