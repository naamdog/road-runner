"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Link2, Unlink, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlatformIcon } from "@/components/platform-icon";
import { PLATFORMS, PLATFORM_META, type Platform } from "@/lib/platforms";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface Connection {
  id: string;
  platform: Platform;
  accountName: string;
  accountHandle: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: string;
}

export function ConnectionsGrid({
  connections,
}: {
  connections: Connection[];
}) {
  const router = useRouter();
  const [pending, setPending] = useState<Platform | null>(null);

  async function connect(platform: Platform) {
    setPending(platform);
    try {
      const res = await fetch(`/api/oauth/${platform}/initiate`, {
        method: "POST",
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Could not start OAuth.");
      }
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not connect.");
      setPending(null);
    }
  }

  async function disconnect(id: string) {
    setPending(connections.find((c) => c.id === id)?.platform ?? null);
    try {
      const res = await fetch(`/api/connections/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Could not disconnect.");
      toast.success("Disconnected.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not disconnect.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {PLATFORMS.map((p) => {
        const meta = PLATFORM_META[p];
        const conn = connections.find((c) => c.platform === p);
        const isPending = pending === p;
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
                  {conn ? (
                    <Badge variant="success" className="gap-1">
                      <CheckCircle2 className="size-3" />
                      Connected
                    </Badge>
                  ) : null}
                </div>
                {conn ? (
                  <div className="text-xs text-muted-foreground truncate mt-0.5">
                    {conn.accountHandle
                      ? `@${conn.accountHandle.replace(/^@/, "")}`
                      : conn.accountName}
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {p === "youtube" && "Channel · post Shorts up to 60s"}
                    {p === "instagram" && "Business / Creator · post Reels up to 90s"}
                    {p === "tiktok" && "Direct post · videos up to 3 min"}
                    {p === "linkedin" && "Personal or Company page video"}
                    {p === "facebook" && "Page Reels up to 90s"}
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border">
              {conn ? (
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Avatar className="size-7">
                      {conn.avatarUrl ? (
                        <AvatarImage src={conn.avatarUrl} alt="" />
                      ) : null}
                      <AvatarFallback className="text-[10px] bg-surface-3">
                        {conn.accountName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="text-xs min-w-0">
                      <div className="text-foreground truncate">
                        {conn.accountName}
                      </div>
                      <div className="text-subtle-foreground tabular-nums">
                        connected {new Date(conn.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => disconnect(conn.id)}
                    disabled={isPending}
                    className="text-destructive hover:text-destructive"
                  >
                    {isPending ? (
                      <Loader2 className="size-3 animate-spin" />
                    ) : (
                      <Unlink className="size-3" />
                    )}
                    Disconnect
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => connect(p)}
                  disabled={isPending}
                  size="md"
                  variant="outline"
                  className="w-full"
                >
                  {isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Link2 className="size-4" />
                  )}
                  Connect {meta.shortName}
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
