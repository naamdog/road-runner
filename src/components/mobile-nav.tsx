"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Plus,
  CalendarDays,
  Link2,
  Repeat,
  Settings,
  Tv,
  Users,
  Menu,
  X,
} from "lucide-react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/compose", label: "New short", icon: Plus, primary: true },
  { href: "/tube", label: "TubeRunner", icon: Tv },
  { href: "/re-runner", label: "Re-runner", icon: Repeat },
  { href: "/scheduled", label: "Lined up", icon: CalendarDays },
  { href: "/connections", label: "Accounts", icon: Link2 },
  { href: "/brands", label: "Brands", icon: Users },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="lg:hidden inline-flex items-center justify-center size-9 rounded-md border border-border bg-surface-2 hover:bg-surface-3"
      >
        <Menu className="size-4" />
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={() => setOpen(false)}
        >
          <aside
            onClick={(e) => e.stopPropagation()}
            className="absolute top-0 left-0 bottom-0 w-72 bg-background border-r border-border flex flex-col"
          >
            <div className="flex items-center justify-between px-4 h-14 border-b border-border">
              <Logo size={26} showWordmark />
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="size-9 inline-flex items-center justify-center rounded-md hover:bg-surface-2"
              >
                <X className="size-4" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {items.map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href ||
                  (item.href !== "/dashboard" &&
                    pathname.startsWith(item.href));
                if (item.primary) {
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="flex items-center gap-2 rounded-md bg-brand text-brand-foreground px-3 py-2.5 text-sm font-medium"
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
                      "flex items-center gap-2 rounded-md px-3 py-2.5 text-sm transition-colors",
                      active
                        ? "bg-surface-2 text-foreground border border-border"
                        : "text-muted-foreground hover:bg-surface-2"
                    )}
                  >
                    <Icon className="size-4" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </nav>
          </aside>
        </div>
      ) : null}
    </>
  );
}
