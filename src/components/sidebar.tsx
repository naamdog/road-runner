"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Plus,
  CalendarDays,
  Link2,
  Settings,
  Tv,
  Users,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/compose", label: "New Short / Reel", icon: Plus, primary: true },
  { href: "/tube", label: "YouTube Long Form", icon: Tv },
  { href: "/scheduled", label: "Scheduled", icon: CalendarDays },
  { href: "/connections", label: "Platform connections", icon: Link2 },
  { href: "/brands", label: "Brands", icon: Users },
];

const secondary = [{ href: "/settings", label: "Settings", icon: Settings }];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-border bg-surface/40 backdrop-blur sticky top-0 h-svh">
      <div className="px-4 h-14 flex items-center border-b border-border/60">
        <Link href="/dashboard">
          <Logo size={26} showWordmark />
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-2.5 space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          if (item.primary) {
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "mt-1 flex items-center gap-2 rounded-md bg-brand text-brand-foreground px-3 py-2 text-sm font-medium",
                  "shadow-[0_0_0_1px_rgba(204,255,0,0.5),0_8px_24px_-12px_rgba(204,255,0,0.6)]",
                  "hover:bg-brand-muted transition-colors"
                )}
              >
                <Icon className="size-4" />
                <span>{item.label}</span>
              </Link>
            );
          }
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-surface-2 text-foreground border border-border"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-2/70 border border-transparent"
              )}
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-2.5 border-t border-border/60 space-y-0.5">
        {secondary.map((item) => {
          const Icon = item.icon;
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                active
                  ? "bg-surface-2 text-foreground border border-border"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-2/70 border border-transparent"
              )}
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
