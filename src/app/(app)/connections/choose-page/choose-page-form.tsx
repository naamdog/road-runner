"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PlatformIcon } from "@/components/platform-icon";
import { cn } from "@/lib/utils";

interface Option {
  accountId: string;
  accountName: string;
  accountHandle: string | null;
  avatarUrl: string | null;
}

export function ChoosePageForm({
  platform,
  options,
}: {
  platform: "facebook" | "instagram";
  options: Option[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState(options[0]?.accountId ?? "");
  const [saving, setSaving] = useState(false);

  async function connect() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch("/api/meta/select-page", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId: selected }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Couldn't connect that one.");
      }
      toast.success("Connected.");
      router.push(`/connections?connected=${platform}&count=1`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't connect.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="space-y-2">
        {options.map((o) => {
          const active = selected === o.accountId;
          return (
            <button
              key={o.accountId}
              type="button"
              onClick={() => setSelected(o.accountId)}
              className={cn(
                "w-full flex items-center gap-3 rounded-md border px-3 py-2.5 text-left transition-colors",
                active
                  ? "border-brand bg-brand/[0.06]"
                  : "border-border hover:bg-surface-2 hover:border-border-strong"
              )}
            >
              <span
                className={cn(
                  "size-4 rounded-full border flex items-center justify-center shrink-0",
                  active ? "bg-brand border-brand text-brand-foreground" : "border-border-strong"
                )}
              >
                {active ? <Check className="size-3 stroke-[3]" /> : null}
              </span>
              {o.avatarUrl ? (
                <Image
                  src={o.avatarUrl}
                  alt=""
                  width={28}
                  height={28}
                  className="size-7 rounded-full object-cover"
                  unoptimized
                />
              ) : (
                <span className="size-7 rounded-full bg-surface-2 border border-border flex items-center justify-center">
                  <PlatformIcon platform={platform} size={16} />
                </span>
              )}
              <span className="min-w-0">
                <span className="block text-sm font-medium truncate">
                  {o.accountName}
                </span>
                {o.accountHandle ? (
                  <span className="block text-xs text-muted-foreground truncate">
                    @{o.accountHandle.replace(/^@/, "")}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex justify-end gap-2">
        <Button
          variant="ghost"
          onClick={() => router.push("/connections")}
          disabled={saving}
        >
          Cancel
        </Button>
        <Button variant="brand" onClick={connect} disabled={saving || !selected}>
          {saving ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Connecting…
            </>
          ) : (
            "Connect this one"
          )}
        </Button>
      </div>
    </div>
  );
}
