"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, CalendarDays, AlertTriangle, Link2, Upload, ExternalLink } from "lucide-react";
import { Logo } from "@/components/logo";
import { cn } from "@/lib/utils";

const items = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/schedule", label: "Schedule", icon: CalendarDays },
  { href: "/failed", label: "Failed", icon: AlertTriangle },
  { href: "/accounts", label: "Accounts", icon: Link2 },
  { href: "/import", label: "Bulk import", icon: Upload },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden lg:flex w-60 shrink-0 flex-col border-r border-border bg-surface/40 backdrop-blur sticky top-0 h-svh">
      <div className="px-4 h-14 flex items-center border-b border-border/60">
        <Link href="/dashboard">
          <Logo size={26} showWordmark />
        </Link>
      </div>

      <nav className="flex-1 p-3 space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2.5 px-2.5 h-9 rounded-md text-sm transition-colors",
                active
                  ? "bg-surface-2 text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface-2/60"
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Publishing lives in Blotato now, so make the hand-off explicit. */}
      <div className="p-3 border-t border-border/60">
        <a
          href="https://my.blotato.com"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2.5 px-2.5 h-9 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-surface-2/60 transition-colors"
        >
          <ExternalLink className="size-4 shrink-0" />
          <span>Open Blotato</span>
        </a>
        <p className="px-2.5 pt-2 text-[11px] leading-relaxed text-subtle-foreground">
          Blotato holds the connections and does the posting. Add or remove accounts there.
        </p>
      </div>
    </aside>
  );
}
