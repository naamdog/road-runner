import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import type { Metadata } from "next";
import { Logo } from "@/components/logo";
import { Card } from "@/components/ui/card";
import { COOKIE, COOKIE_OPTS, checkPasscode, mintToken, verifyToken } from "@/lib/gate";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ e?: string }>;
}) {
  const jar = await cookies();
  if (verifyToken(jar.get(COOKIE)?.value)) redirect("/dashboard");
  const { e } = await searchParams;

  async function signIn(formData: FormData) {
    "use server";
    const code = String(formData.get("passcode") ?? "");
    if (!checkPasscode(code)) redirect("/login?e=1");
    (await cookies()).set(COOKIE, mintToken(), COOKIE_OPTS);
    redirect("/dashboard");
  }

  return (
    <div className="min-h-svh grid place-items-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6">
          <Logo size={34} showWordmark />
        </div>
        <Card className="p-6">
          <h1 className="text-lg font-semibold tracking-tight">Sign in</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Enter the team passcode to see the schedule.
          </p>
          <form action={signIn} className="mt-5 space-y-3">
            <input
              type="password"
              name="passcode"
              autoFocus
              required
              placeholder="Passcode"
              aria-label="Passcode"
              className="w-full h-10 rounded-md border border-border bg-surface px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:border-brand/50"
            />
            {e ? <p className="text-xs text-destructive">That passcode didn&apos;t work.</p> : null}
            <button
              type="submit"
              className="w-full h-10 rounded-md bg-brand text-brand-foreground text-sm font-medium hover:bg-brand-muted transition-colors"
            >
              Sign in
            </button>
          </form>
        </Card>
      </div>
    </div>
  );
}
