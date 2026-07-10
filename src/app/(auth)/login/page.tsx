import type { Metadata } from "next";
import { getConfig } from "@/lib/config";
import { LoginForm } from "./form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Road Runner.",
};

export default function LoginPage() {
  const emailPasswordEnabled = getConfig().enableEmailPasswordAuth;
  return (
    <>
      <div className="text-center mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {emailPasswordEnabled
            ? "Sign in to your Road Runner account."
            : "Sign in with your teflheaven.com Google account."}
        </p>
      </div>
      <LoginForm emailPasswordEnabled={emailPasswordEnabled} />
    </>
  );
}
