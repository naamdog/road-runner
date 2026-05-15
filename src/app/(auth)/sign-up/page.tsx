import type { Metadata } from "next";
import { SignUpForm } from "./form";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Start scheduling shorts across YouTube, Instagram, TikTok, LinkedIn, and Facebook.",
};

export default function SignUpPage() {
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
