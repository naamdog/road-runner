import Link from "next/link";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { ArrowUpRight } from "lucide-react";

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-40 w-full">
      <div className="absolute inset-0 bg-background/60 backdrop-blur-xl border-b border-border/60" />
      <nav className="relative container-page flex h-14 items-center justify-between">
        <Link href="/" className="flex items-center gap-2.5">
          <Logo size={26} showWordmark />
        </Link>
        <div className="hidden md:flex items-center gap-1 text-sm">
          <Link
            href="#features"
            className="px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            Features
          </Link>
          <Link
            href="#how-it-works"
            className="px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            How it works
          </Link>
          <Link
            href="#pricing"
            className="px-3 py-2 text-muted-foreground hover:text-foreground transition-colors"
          >
            Pricing
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/login">Sign in</Link>
          </Button>
          <Button variant="brand" size="sm" asChild>
            <Link href="/sign-up" className="gap-1.5">
              Start free
              <ArrowUpRight className="size-3.5" />
            </Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border/60 mt-24">
      <div className="container-page py-12 grid gap-8 md:grid-cols-4">
        <div className="md:col-span-2">
          <Logo size={26} showWordmark />
          <p className="mt-3 text-sm text-muted-foreground max-w-sm">
            Schedule once. Run everywhere. Short-form video, five platforms,
            zero busywork.
          </p>
        </div>
        <div>
          <h4 className="text-xs uppercase tracking-wider text-subtle-foreground">
            Product
          </h4>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="#features" className="text-muted-foreground hover:text-foreground">
                Features
              </Link>
            </li>
            <li>
              <Link href="#pricing" className="text-muted-foreground hover:text-foreground">
                Pricing
              </Link>
            </li>
            <li>
              <Link href="/sign-up" className="text-muted-foreground hover:text-foreground">
                Get started
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h4 className="text-xs uppercase tracking-wider text-subtle-foreground">
            Legal
          </h4>
          <ul className="mt-3 space-y-2 text-sm">
            <li>
              <Link href="/privacy" className="text-muted-foreground hover:text-foreground">
                Privacy
              </Link>
            </li>
            <li>
              <Link href="/terms" className="text-muted-foreground hover:text-foreground">
                Terms
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="container-page py-5 border-t border-border/60 flex items-center justify-between text-xs text-subtle-foreground">
        <span>© {new Date().getFullYear()} Road Runner</span>
        <span className="font-mono">v0.1</span>
      </div>
    </footer>
  );
}
