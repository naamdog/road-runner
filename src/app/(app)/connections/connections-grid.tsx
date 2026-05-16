"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  Loader2,
  Link2,
  Plus,
  Unlink,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { PlatformIcon } from "@/components/platform-icon";
import { PLATFORMS, PLATFORM_META, type Platform } from "@/lib/platforms";
import { cn } from "@/lib/utils";

export interface BrandLite {
  id: string;
  name: string;
  color: string;
}

export interface ConnectionRow {
  id: string;
  platform: Platform;
  brandId: string | null;
  accountName: string;
  accountHandle: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: string;
}

export function ConnectionsGrid({
  connections,
  brands,
  activeBrandId,
}: {
  connections: ConnectionRow[];
  brands: BrandLite[];
  activeBrandId: string | null;
}) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [brandFilter, setBrandFilter] = useState<string | "all">(
    activeBrandId ?? "all"
  );

  const filteredConnections = useMemo(() => {
    if (brandFilter === "all") return connections;
    return connections.filter((c) => c.brandId === brandFilter);
  }, [connections, brandFilter]);

  async function connect(platform: Platform) {
    const brandId =
      brandFilter !== "all" ? brandFilter : activeBrandId;
    setPending(`connect:${platform}`);
    try {
      const res = await fetch(`/api/oauth/${platform}/initiate`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brandId }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Could not start sign-in");
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect");
      setPending(null);
    }
  }

  async function disconnect(id: string) {
    setPending(`disconnect:${id}`);
    try {
      const res = await fetch(`/api/connections/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not disconnect");
      toast.success("Account removed.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not disconnect");
    } finally {
      setPending(null);
    }
  }

  async function moveToBrand(connectionId: string, brandId: string) {
    setPending(`move:${connectionId}`);
    try {
      const res = await fetch(`/api/connections/${connectionId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brandId }),
      });
      if (!res.ok) throw new Error("Could not move account");
      toast.success("Moved.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not move");
    } finally {
      setPending(null);
    }
  }

  const brandsById = useMemo(
    () => Object.fromEntries(brands.map((b) => [b.id, b])),
    [brands]
  );

  // Group connections by platform within the selected brand for "Add another" UI
  const byPlatform = useMemo(() => {
    const m = new Map<Platform, ConnectionRow[]>();
    for (const c of filteredConnections) {
      if (!m.has(c.platform)) m.set(c.platform, []);
      m.get(c.platform)!.push(c);
    }
    return m;
  }, [filteredConnections]);

  return (
    <div className="space-y-5">
      {/* Brand filter chips */}
      {brands.length > 1 ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={() => setBrandFilter("all")}
            className={cn(
              "h-7 px-2.5 rounded-full text-xs font-medium border transition-colors",
              brandFilter === "all"
                ? "bg-surface-2 text-foreground border-border"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            All brands
          </button>
          {brands.map((b) => (
            <button
              key={b.id}
              onClick={() => setBrandFilter(b.id)}
              className={cn(
                "h-7 px-2.5 rounded-full text-xs font-medium border transition-colors inline-flex items-center gap-1.5",
                brandFilter === b.id
                  ? "bg-surface-2 text-foreground border-border"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              <span
                className="size-2 rounded-full"
                style={{ background: b.color }}
              />
              {b.name}
            </button>
          ))}
        </div>
      ) : null}

      {/* Connect cards — one per platform with all accounts grouped under it */}
      <div className="grid sm:grid-cols-2 gap-3">
        {PLATFORMS.map((p) => {
          const meta = PLATFORM_META[p];
          const accounts = byPlatform.get(p) ?? [];
          const isPending = pending === `connect:${p}`;
          return (
            <Card key={p} className="p-5">
              <div className="flex items-center gap-3 min-w-0">
                <div className="size-10 rounded-md bg-surface-2 border border-border flex items-center justify-center shrink-0">
                  <PlatformIcon platform={p} size={22} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold truncate">
                      {meta.name}
                    </h3>
                    {accounts.length > 0 ? (
                      <Badge variant="success" className="gap-1">
                        <CheckCircle2 className="size-3" />
                        {accounts.length} account{accounts.length === 1 ? "" : "s"}
                      </Badge>
                    ) : null}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {p === "youtube" && "Post Shorts (up to 60 seconds)"}
                    {p === "instagram" && "Post Reels (up to 90 seconds)"}
                    {p === "tiktok" && "Post videos (up to 3 minutes)"}
                    {p === "linkedin" && "Post videos to your profile or page"}
                    {p === "facebook" && "Post Reels to a Page (up to 90 seconds)"}
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-border space-y-2">
                {accounts.map((conn) => (
                  <div
                    key={conn.id}
                    className="flex items-center gap-2"
                  >
                    <Avatar className="size-7">
                      {conn.avatarUrl ? (
                        <AvatarImage src={conn.avatarUrl} alt="" />
                      ) : null}
                      <AvatarFallback className="text-[10px] bg-surface-3">
                        {conn.accountName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-xs min-w-0 flex-1">
                      <div className="text-foreground truncate">
                        {conn.accountName}
                      </div>
                      <div className="text-subtle-foreground truncate flex items-center gap-1.5">
                        {conn.brandId && brandsById[conn.brandId] ? (
                          <>
                            <span
                              className="size-1.5 rounded-full"
                              style={{
                                background: brandsById[conn.brandId].color,
                              }}
                            />
                            {brandsById[conn.brandId].name}
                          </>
                        ) : (
                          <span className="italic">No brand</span>
                        )}
                      </div>
                    </div>
                    {brands.length > 1 ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="xs"
                            title="Move to another brand"
                            disabled={pending === `move:${conn.id}`}
                          >
                            Move
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Move to brand</DropdownMenuLabel>
                          {brands.map((b) => (
                            <DropdownMenuItem
                              key={b.id}
                              disabled={b.id === conn.brandId}
                              onSelect={(e) => {
                                e.preventDefault();
                                void moveToBrand(conn.id, b.id);
                              }}
                              className="cursor-pointer"
                            >
                              <span
                                className="size-2 rounded-full"
                                style={{ background: b.color }}
                              />
                              {b.name}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : null}
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => disconnect(conn.id)}
                      disabled={pending === `disconnect:${conn.id}`}
                      className="text-destructive hover:text-destructive"
                      title="Remove account"
                    >
                      {pending === `disconnect:${conn.id}` ? (
                        <Loader2 className="size-3 animate-spin" />
                      ) : (
                        <Unlink className="size-3" />
                      )}
                    </Button>
                  </div>
                ))}

                <Button
                  onClick={() => connect(p)}
                  disabled={isPending}
                  size="sm"
                  variant={accounts.length === 0 ? "outline" : "ghost"}
                  className="w-full gap-1.5 mt-1"
                >
                  {isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : accounts.length === 0 ? (
                    <Link2 className="size-3.5" />
                  ) : (
                    <Plus className="size-3.5" />
                  )}
                  {accounts.length === 0
                    ? `Connect ${meta.shortName}`
                    : "Add another"}
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
