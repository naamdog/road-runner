"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";
import {
  Check,
  ChevronsUpDown,
  Plus,
  Settings as SettingsIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export interface BrandLite {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
}

export function BrandSwitcher({
  brands,
  activeBrandId,
  compact = false,
}: {
  brands: BrandLite[];
  activeBrandId: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const active = brands.find((b) => b.id === activeBrandId) ?? brands[0];

  async function pick(brandId: string) {
    if (brandId === active?.id) return;
    setPending(true);
    try {
      const res = await fetch("/api/brands/active", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brandId }),
      });
      if (!res.ok) throw new Error("Could not switch");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not switch");
    } finally {
      setPending(false);
    }
  }

  if (!active) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm hover:bg-surface-2 hover:border-border-strong transition-colors",
            compact ? "max-w-[180px]" : "max-w-[140px] sm:max-w-[220px]",
            pending && "opacity-60"
          )}
        >
          <span
            className="size-2.5 rounded-full shrink-0"
            style={{ background: active.color }}
            aria-hidden
          />
          <span className="truncate font-medium">{active.name}</span>
          <ChevronsUpDown className="size-3.5 text-muted-foreground shrink-0" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60">
        <DropdownMenuLabel>Your brands</DropdownMenuLabel>
        {brands.map((b) => (
          <DropdownMenuItem
            key={b.id}
            onSelect={(e) => {
              e.preventDefault();
              void pick(b.id);
            }}
            className="cursor-pointer"
          >
            <span
              className="size-2.5 rounded-full"
              style={{ background: b.color }}
              aria-hidden
            />
            <span className="flex-1 truncate">{b.name}</span>
            {b.id === active.id ? (
              <Check className="size-3.5 text-brand" />
            ) : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/brands" className="cursor-pointer">
            <Plus className="size-3.5" />
            New brand
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/brands" className="cursor-pointer">
            <SettingsIcon className="size-3.5" />
            Manage brands
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
