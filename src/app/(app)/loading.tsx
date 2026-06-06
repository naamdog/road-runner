import { Logo } from "@/components/logo";

/**
 * Route-level loading state for the authed shell.
 * Renders inside <main> of the AppShell, so it fills the content area
 * (not the full viewport). Lightweight, on-brand, motion-respectful.
 */
export default function Loading() {
  return (
    <div
      className="flex min-h-[60vh] flex-col items-center justify-center px-6"
      role="status"
      aria-live="polite"
    >
      <div className="relative flex items-center justify-center">
        <span
          aria-hidden
          className="absolute size-16 rounded-2xl bg-brand/15 animate-pulse-glow"
        />
        <Logo size={40} className="relative" />
      </div>
      <p className="mt-6 text-sm text-muted-foreground">Loading…</p>
      <span className="sr-only">Loading content</span>
    </div>
  );
}
