"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

function GoogleGlyph() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className="size-4">
      <path
        fill="#EA4335"
        d="M24 9.5c3.4 0 6.5 1.2 8.9 3.5l6.6-6.6C35.4 2.5 30 0 24 0 14.6 0 6.5 5.4 2.5 13.2l7.7 6C12.1 13.1 17.5 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.5 3-2.2 5.5-4.7 7.2l7.3 5.7c4.3-4 6.8-9.8 6.8-17.4z"
      />
      <path
        fill="#FBBC05"
        d="M10.2 19.2a14.5 14.5 0 0 0 0 9.6l-7.7 6a24 24 0 0 1 0-21.6l7.7 6z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.7 2.2-8.6 2.2-6.5 0-12-4.4-13.8-10.2l-7.7 6C6.5 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}

export function GoogleSignInButton({
  callbackURL = "/dashboard",
}: {
  callbackURL?: string;
}) {
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    try {
      await authClient.signIn.social({
        provider: "google",
        callbackURL,
        errorCallbackURL: "/login?error=google_denied",
      });
    } catch {
      setPending(false);
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="w-full"
      disabled={pending}
      onClick={onClick}
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <GoogleGlyph />}
      Continue with Google
    </Button>
  );
}
