"use client";

import Link from "next/link";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-svh w-full bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-14 border-b border-border bg-background/80 backdrop-blur-xl flex items-center px-4 lg:px-6 gap-3">
          <MobileNav />
          <Link href="/dashboard" className="lg:hidden flex items-center">
            <Logo size={24} />
          </Link>
          <div className="flex items-center gap-2 ml-auto">
            <ThemeToggle variant="icon-sm" />
            <form action="/api/logout" method="post">
              <button
                type="submit"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
              >
                Sign out
              </button>
            </form>
          </div>
        </header>
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}
