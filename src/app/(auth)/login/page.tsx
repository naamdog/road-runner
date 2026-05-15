import type { Metadata } from "next";
import { LoginForm } from "./form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Road Runner.",
};

export default function LoginPage() {
  return (
    <>
      <div className="text-center mb-6">
        <h1 className="text-xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Sign in to your Road Runner account.
        </p>
      </div>
      <LoginForm />
    </>
  );
}
