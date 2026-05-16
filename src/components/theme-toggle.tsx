"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { id: "light", label: "Light", Icon: Sun },
  { id: "dark", label: "Dark", Icon: Moon },
  { id: "system", label: "System", Icon: Monitor },
] as const;

type Variant = "icon" | "icon-sm";

export function ThemeToggle({
  variant = "icon",
  className,
}: {
  variant?: Variant;
  className?: string;
}) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Pick the icon based on the *active* theme (so system = sun/moon based on OS)
  const active = mounted ? (theme === "system" ? resolvedTheme : theme) : "dark";
  const ActiveIcon = active === "light" ? Sun : Moon;

  const size = variant === "icon" ? "size-9" : "size-8";
  const iconSize = variant === "icon" ? "size-4" : "size-3.5";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Switch theme"
          className={cn(
            "inline-flex items-center justify-center rounded-md border border-border bg-surface text-foreground hover:bg-surface-2 hover:border-border-strong transition-colors",
            size,
            className
          )}
        >
          <ActiveIcon className={iconSize} />
          <span className="sr-only">
            Theme: {mounted ? theme : "loading"}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONS.map(({ id, label, Icon }) => (
          <DropdownMenuItem
            key={id}
            onSelect={(e) => {
              e.preventDefault();
              setTheme(id);
            }}
            className="cursor-pointer"
          >
            <Icon className="size-3.5" />
            <span className="flex-1">{label}</span>
            {mounted && theme === id ? (
              <Check className="size-3.5 text-brand" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
