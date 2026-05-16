"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { MobileNav } from "@/components/mobile-nav";
import { UserMenu } from "@/components/user-menu";
import { CommandPalette } from "@/components/command-palette";
import { Logo } from "@/components/logo";
import { Button } from "@/components/ui/button";
import { BrandSwitcher, type BrandLite } from "@/components/brand-switcher";

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
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <div className="flex min-h-svh w-full bg-background">
      <Sidebar onOpenPalette={() => setPaletteOpen(true)} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          user={user}
          brands={brands}
          activeBrandId={activeBrandId}
          onOpenPalette={() => setPaletteOpen(true)}
        />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
      <CommandPalette open={paletteOpen} setOpen={setPaletteOpen} />
    </div>
  );
}

function TopBar({
  user,
  brands,
  activeBrandId,
  onOpenPalette,
}: {
  user: { name: string; email: string };
  brands: BrandLite[];
  activeBrandId: string | null;
  onOpenPalette: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 h-14 border-b border-border bg-background/80 backdrop-blur-xl flex items-center px-4 lg:px-6 gap-3">
      <MobileNav />
      <Link
        href="/dashboard"
        className="lg:hidden flex items-center"
      >
        <Logo size={24} />
      </Link>
      {brands.length > 0 ? (
        <BrandSwitcher brands={brands} activeBrandId={activeBrandId} />
      ) : null}
      <button
        onClick={onOpenPalette}
        className="hidden sm:flex flex-1 max-w-md group items-center gap-2 rounded-md border border-border bg-surface/70 px-3 py-1.5 text-sm text-muted-foreground hover:bg-surface-2 hover:border-border-strong transition-colors"
      >
        <Search className="size-3.5" />
        <span className="text-xs">Search or jump to…</span>
        <span className="ml-auto font-mono text-[10px] rounded border border-border bg-surface-3 px-1.5 py-0.5">
          ⌘K
        </span>
      </button>
      <div className="flex items-center gap-2 ml-auto">
        <Button asChild variant="brand" size="sm">
          <Link href="/compose" className="gap-1.5">
            <Plus className="size-3.5" />
            New post
          </Link>
        </Button>
        <UserMenu name={user.name} email={user.email} />
      </div>
    </header>
  );
}
