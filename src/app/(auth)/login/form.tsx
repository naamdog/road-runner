"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { authClient } from "@/lib/auth-client";

const GOOGLE_ERROR_MESSAGES: Record<string, string> = {
  google_denied: "That Google account isn't on teflheaven.com.",
};

export function LoginForm({
  emailPasswordEnabled,
}: {
  emailPasswordEnabled: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [showPw, setShowPw] = useState(false);

  // Plain window.location read (not useSearchParams) so this component
  // doesn't need a Suspense boundary for a one-off error toast.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (error) {
      toast.error(GOOGLE_ERROR_MESSAGES[error] ?? "Sign in failed.");
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "").trim();
    const password = String(fd.get("password") || "");

    if (!email || !password) {
      toast.error("Enter your email and password.");
      return;
    }

    setPending(true);
    try {
      const { error } = await authClient.signIn.email({ email, password });
      if (error) {
        toast.error(error.message || "Sign in failed.");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setPending(false);
    }
  }

  if (!emailPasswordEnabled) {
    return <GoogleSignInButton />;
  }

  return (
    <div className="space-y-4">
      <GoogleSignInButton />
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="h-px flex-1 bg-border" />
        or
        <div className="h-px flex-1 bg-border" />
      </div>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            disabled={pending}
            placeholder="you@domain.com"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link
              href="/reset"
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Forgot?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPw ? "text" : "password"}
              autoComplete="current-password"
              required
              disabled={pending}
              className="pr-14"
            />
            <button
              type="button"
              onClick={() => setShowPw((s) => !s)}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground px-1.5 py-1 rounded"
              tabIndex={-1}
            >
              {showPw ? "Hide" : "Show"}
            </button>
          </div>
        </div>
        <Button type="submit" variant="brand" size="lg" className="w-full" disabled={pending}>
          {pending ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Signing in…
            </>
          ) : (
            "Sign in"
          )}
        </Button>
        <p className="text-center text-sm text-muted-foreground pt-2">
          New here?{" "}
          <Link href="/sign-up" className="text-foreground hover:text-brand underline-offset-4 hover:underline">
            Create an account
          </Link>
        </p>
      </form>
    </div>
  );
}
