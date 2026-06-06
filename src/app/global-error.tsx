"use client";

import { useEffect } from "react";
import "./globals.css";

/**
 * Root error boundary — the last line of defense. It replaces the entire
 * document (including the root layout), so it MUST render its own
 * <html> and <body>. It cannot rely on the ThemeProvider, fonts, or the
 * AppShell, so styling is kept self-contained and forces the brand's
 * near-black surface (we apply the `dark` class to activate dark tokens
 * and set explicit fallbacks for the parts that depend on the root layout).
 *
 * Brand: electric lime (--color-brand) on near-black. The mark is the two
 * leaning slashes — drawn inline here so we don't depend on any component
 * that might itself be failing.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en" className="dark">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#08090a",
          color: "#f7f7f8",
          fontFamily:
            "var(--font-geist-sans), ui-sans-serif, system-ui, -apple-system, sans-serif",
          WebkitFontSmoothing: "antialiased",
        }}
      >
        <div className="relative min-h-screen flex flex-col items-center justify-center px-6">
          <div
            aria-hidden
            className="absolute inset-0 bg-grid opacity-[0.25] [mask-image:radial-gradient(circle_at_center,black_20%,transparent_70%)] pointer-events-none"
          />
          <div className="relative text-center">
            {/* Brand mark: two leaning slashes — pure velocity glyph. */}
            <svg
              width={64}
              height={64}
              viewBox="0 0 96 96"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
              className="mx-auto"
            >
              <rect
                x="1"
                y="1"
                width="94"
                height="94"
                rx="22"
                fill="#0f1014"
                stroke="rgba(255,255,255,0.05)"
              />
              <path d="M27 69 L40.5 27 H48 L34.5 69 Z" fill="#ccff00" />
              <path d="M49 69 L62.5 27 H70 L56.5 69 Z" fill="#ccff00" />
            </svg>
            <h1 className="mt-6 text-3xl md:text-4xl font-semibold tracking-[-0.03em]">
              Something hit the brakes.
            </h1>
            <p className="mt-3 text-sm text-muted-foreground max-w-sm mx-auto">
              The app ran into an unexpected error. Try reloading — if it keeps
              happening, give it a minute and come back.
            </p>
            {error.digest ? (
              <p className="mt-3 font-mono text-xs text-subtle-foreground">
                Ref: {error.digest}
              </p>
            ) : null}
            <div className="mt-7 flex items-center justify-center gap-2">
              <button
                onClick={() => reset()}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  height: "2.5rem",
                  padding: "0 1.25rem",
                  borderRadius: "10px",
                  border: "none",
                  background: "#ccff00",
                  color: "#0a0a0b",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  cursor: "pointer",
                  boxShadow:
                    "0 0 0 1px rgba(204,255,0,0.4), 0 8px 24px -8px rgba(204,255,0,0.5)",
                }}
              >
                Try again
              </button>
              <a
                href="/dashboard"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: "2.5rem",
                  padding: "0 1.25rem",
                  borderRadius: "10px",
                  border: "1px solid #26292e",
                  background: "transparent",
                  color: "#f7f7f8",
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  textDecoration: "none",
                }}
              >
                Go to dashboard
              </a>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
