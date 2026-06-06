"use client";

import Link from "next/link";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { UserMenu } from "@/components/user-menu";
import { Logo } from "@/components/logo";
import { BrandSwitcher, type BrandLite } from "@/components/brand-switcher";
import { ThemeToggle } from "@/components/theme-toggle";

export function AppShell({
  user,
  brands,
  activeBrandId,
  children,
}: {
  user: { name: string; email: string };
  brands: BrandLite[];
  activeBrandId: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-svh w-full bg-background">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar user={user} brands={brands} activeBrandId={activeBrandId} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
    </div>
  );
}

function TopBar({
  user,
  brands,
  activeBrandId,
}: {
  user: { name: string; email: string };
  brands: BrandLite[];
  activeBrandId: string | null;
}) {
  return (
    <header className="sticky top-0 z-30 h-14 border-b border-border bg-background/80 backdrop-blur-xl flex items-center px-4 lg:px-6 gap-3">
      <MobileNav />
      <Link href="/dashboard" className="lg:hidden flex items-center">
        <Logo size={24} />
      </Link>
      {brands.length > 0 ? (
        <BrandSwitcher brands={brands} activeBrandId={activeBrandId} />
      ) : null}
      <div className="flex items-center gap-2 ml-auto">
        <ThemeToggle variant="icon-sm" />
        <UserMenu name={user.name} email={user.email} />
      </div>
    </header>
  );
}
