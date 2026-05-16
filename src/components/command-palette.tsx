"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  LayoutDashboard,
  Plus,
  CalendarDays,
  Link2,
  Repeat,
  Settings,
  LogOut,
  Search,
  Tv,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";

export function CommandPalette({
  open,
  setOpen,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!open);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  // Sequence shortcuts: G then D / S / C
  useEffect(() => {
    let prefix = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;

    const onKey = (e: KeyboardEvent) => {
      // Don't capture when typing in an input
      const target = e.target as HTMLElement;
      const tag = target.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (open) return;

      if (prefix) {
        prefix = false;
        if (timeout) clearTimeout(timeout);
        const k = e.key.toLowerCase();
        if (k === "d") router.push("/dashboard");
        else if (k === "s") router.push("/scheduled");
        else if (k === "a") router.push("/connections");
        else if (k === "r") router.push("/re-runner");
        else if (k === "b") router.push("/brands");
        else if (k === "t") router.push("/tube");
        else if (k === "n") router.push("/compose");
        return;
      }
      if (e.key.toLowerCase() === "g") {
        prefix = true;
        timeout = setTimeout(() => (prefix = false), 1200);
      } else if (e.key.toLowerCase() === "c") {
        router.push("/compose");
      } else if (e.key === "/") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (timeout) clearTimeout(timeout);
    };
  }, [open, router, setOpen]);

  function go(href: string) {
    setOpen(false);
    router.push(href);
  }

  async function signOut() {
    setOpen(false);
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-black/70 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <Command
        label="Command palette"
        value={value}
        onValueChange={setValue}
        className={cn(
          "w-full max-w-lg rounded-xl border border-border bg-surface shadow-pop overflow-hidden",
          "data-[state=open]:animate-in"
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-2.5">
          <Search className="size-4 text-muted-foreground" />
          <Command.Input
            autoFocus
            placeholder="Search or type a command…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-subtle-foreground"
          />
          <kbd className="rounded border border-border bg-surface-2 px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground">
            ESC
          </kbd>
        </div>
        <Command.List className="max-h-80 overflow-y-auto p-1.5">
          <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
            No results.
          </Command.Empty>

          <Command.Group heading="Actions" className="text-xs uppercase tracking-wider text-subtle-foreground px-2 pt-2 pb-1">
            <Item
              icon={Plus}
              label="New short"
              shortcut="C"
              onSelect={() => go("/compose")}
            />
            <Item
              icon={Tv}
              label="New long video (TubeRunner)"
              onSelect={() => go("/tube/compose")}
            />
            <Item
              icon={Repeat}
              label="Re-run a top performer"
              shortcut="G R"
              onSelect={() => go("/re-runner")}
            />
          </Command.Group>

          <Command.Group heading="Go to" className="text-xs uppercase tracking-wider text-subtle-foreground px-2 pt-3 pb-1">
            <Item
              icon={LayoutDashboard}
              label="Home"
              shortcut="G D"
              onSelect={() => go("/dashboard")}
            />
            <Item
              icon={Tv}
              label="TubeRunner"
              shortcut="G T"
              onSelect={() => go("/tube")}
            />
            <Item
              icon={Repeat}
              label="Re-runner"
              shortcut="G R"
              onSelect={() => go("/re-runner")}
            />
            <Item
              icon={CalendarDays}
              label="Lined up"
              shortcut="G S"
              onSelect={() => go("/scheduled")}
            />
            <Item
              icon={Link2}
              label="Accounts"
              shortcut="G A"
              onSelect={() => go("/connections")}
            />
            <Item
              icon={Users}
              label="Brands"
              shortcut="G B"
              onSelect={() => go("/brands")}
            />
            <Item
              icon={Settings}
              label="Settings"
              onSelect={() => go("/settings")}
            />
          </Command.Group>

          <Command.Group heading="Account" className="text-xs uppercase tracking-wider text-subtle-foreground px-2 pt-3 pb-1">
            <Item
              icon={LogOut}
              label="Sign out"
              onSelect={() => void signOut()}
              destructive
            />
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}

function Item({
  icon: Icon,
  label,
  shortcut,
  onSelect,
  destructive,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut?: string;
  onSelect: () => void;
  destructive?: boolean;
}) {
  return (
    <Command.Item
      onSelect={onSelect}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm cursor-pointer",
        "data-[selected=true]:bg-surface-2",
        destructive ? "text-destructive" : "text-foreground"
      )}
    >
      <Icon className="size-4" />
      <span>{label}</span>
      {shortcut ? (
        <span className="ml-auto font-mono text-[10px] text-subtle-foreground">{shortcut}</span>
      ) : null}
    </Command.Item>
  );
}
