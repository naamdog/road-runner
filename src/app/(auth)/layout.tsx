import Link from "next/link";
import { Logo, LogoMark } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-screen w-full bg-background flex flex-col">
      <div
        aria-hidden
        className="absolute inset-0 bg-grid opacity-[0.25] [mask-image:radial-gradient(circle_at_center,black_20%,transparent_70%)] pointer-events-none"
      />
      <div
        aria-hidden
        className="absolute left-1/2 top-1/3 -translate-x-1/2 -translate-y-1/2 size-[600px] rounded-full bg-brand/[0.05] blur-3xl pointer-events-none"
      />

      <header className="relative px-6 py-5 flex items-center justify-between">
        <Link href="/" className="inline-flex">
          <Logo size={26} showWordmark />
        </Link>
        <ThemeToggle variant="icon-sm" />
      </header>

      <main className="relative flex-1 flex items-center justify-center px-6 pb-16">
        <div className="w-full max-w-sm">
          <div className="flex flex-col items-center mb-7">
            <LogoMark size={56} />
          </div>
          <div className="rounded-xl border border-border bg-surface/80 backdrop-blur-sm p-7 shadow-pop">
            {children}
          </div>
          <p className="mt-6 text-center text-xs text-subtle-foreground">
            By continuing you agree to our{" "}
            <Link href="/terms" className="underline-offset-4 hover:text-foreground hover:underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline-offset-4 hover:text-foreground hover:underline">
              Privacy Policy
            </Link>
            .
          </p>
        </div>
      </main>
    </div>
  );
}
