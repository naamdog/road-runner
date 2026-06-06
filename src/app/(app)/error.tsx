"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";

/**
 * Error boundary for the authed app section. Renders inside <main> of the
 * AppShell, so the sidebar/topbar stay intact while this fills the content
 * area. Matches the tone and styling of src/app/not-found.tsx.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surface the error so it shows up in the browser console / monitoring.
    console.error(error);
  }, [error]);

  return (
    <div className="relative min-h-[70vh] flex flex-col items-center justify-center px-6">
      <div
        aria-hidden
        className="absolute inset-0 bg-grid opacity-[0.25] [mask-image:radial-gradient(circle_at_center,black_20%,transparent_70%)] pointer-events-none"
      />
      <div className="relative text-center">
        <LogoMark size={64} className="mx-auto" />
        <h1 className="mt-6 text-3xl md:text-4xl font-semibold tracking-[-0.03em]">
          Something hit the brakes.
        </h1>
        <p className="mt-3 text-sm text-muted-foreground max-w-sm mx-auto">
          That page ran into an error. It&apos;s on us, not you — give it
          another go, and we&apos;ll try to pick up where we left off.
        </p>
        {error.digest ? (
          <p className="mt-3 font-mono text-xs text-subtle-foreground">
            Ref: {error.digest}
          </p>
        ) : null}
        <div className="mt-7 flex items-center justify-center gap-2">
          <Button variant="brand" size="lg" onClick={() => reset()} className="gap-2">
            <RefreshCw className="size-4" />
            Try again
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
