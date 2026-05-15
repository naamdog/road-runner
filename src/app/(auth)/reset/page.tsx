"use client";

import { useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";

export default function ResetPage() {
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "").trim();
    if (!email) return;

    setPending(true);
    try {
      // Better Auth: send password reset email (requires email sender in prod).
      const res = await fetch("/api/auth/forget-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          redirectTo: `${window.location.origin}/reset/confirm`,
        }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.message || "Could not send reset email.");
      }
      setSent(true);
      toast.success("If that email exists, we sent a reset link.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reset email.");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
      <div className="text-center mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Reset password</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          We'll email you a one-time link.
        </p>
      </div>
      {sent ? (
        <div className="text-center space-y-4">
          <p className="text-sm text-muted-foreground">
            Check your inbox for a password reset link.
          </p>
          <Button asChild variant="outline" size="md" className="w-full">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              disabled={pending}
              autoComplete="email"
              placeholder="you@domain.com"
            />
          </div>
          <Button type="submit" variant="brand" size="lg" className="w-full" disabled={pending}>
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Sending…
              </>
            ) : (
              "Send reset link"
            )}
          </Button>
          <p className="text-center text-sm text-muted-foreground pt-2">
            Remembered it?{" "}
            <Link href="/login" className="text-foreground hover:text-brand underline-offset-4 hover:underline">
              Sign in
            </Link>
          </p>
        </form>
      )}
    </>
  );
}
