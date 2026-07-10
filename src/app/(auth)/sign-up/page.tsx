import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getConfig } from "@/lib/config";
import { SignUpForm } from "./form";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Start scheduling shorts across YouTube, Instagram, TikTok, LinkedIn, and Facebook.",
};

export default function SignUpPage() {
  // Email+password signup is disabled while Road Runner is TEFL-only
  // (Google sign-in auto-provisions an account, so there's no separate
  // "create account" step to offer).
  if (!getConfig().enableEmailPasswordAuth) {
    redirect("/login");
  }
  return (
    <>
      <div className="text-center mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Create your account</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Free forever. No credit card.
        </p>
      </div>
      <SignUpForm />
    </>
  );
}
