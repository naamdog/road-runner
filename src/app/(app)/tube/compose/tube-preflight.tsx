"use client";

import { AlertTriangle, Check, CircleAlert, CircleDashed } from "lucide-react";
import { cn } from "@/lib/utils";

export type CheckStatus = "ok" | "warn" | "missing";

export interface PreflightItem {
  status: CheckStatus;
  label: string;
  detail?: string;
}

/**
 * "Pre-flight checks" panel — green ticks for ready, ambers for nice-to-haves,
 * red for blockers. Gives the creator a one-glance answer to "am I good to go?"
 */
export function TubePreflight({ items }: { items: PreflightItem[] }) {
  const missing = items.filter((i) => i.status === "missing");
  const warnings = items.filter((i) => i.status === "warn");
  const isReady = missing.length === 0;

  return (
    <div className="rounded-xl border border-border bg-surface/60 overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground">
            Pre-flight checks
          </h3>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {isReady
              ? warnings.length === 0
                ? "Everything looks good."
                : `Ready — ${warnings.length} thing${warnings.length === 1 ? "" : "s"} you could improve.`
              : `${missing.length} thing${missing.length === 1 ? "" : "s"} still needed.`}
          </p>
        </div>
        <ReadyBadge ok={isReady} />
      </div>
      <ul className="p-2 space-y-0.5">
        {items.map((item) => (
          <li
            key={item.label}
            className="flex items-start gap-2.5 rounded-md px-2 py-1.5"
          >
            <StatusIcon status={item.status} />
            <div className="flex-1 min-w-0">
              <div
                className={cn(
                  "text-xs leading-snug",
                  item.status === "missing"
                    ? "text-foreground"
                    : "text-muted-foreground"
                )}
              >
                {item.label}
              </div>
              {item.detail ? (
                <div className="text-[11px] text-subtle-foreground tabular-nums">
                  {item.detail}
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "ok") {
    return (
      <div className="mt-0.5 size-4 rounded-full bg-success/15 flex items-center justify-center shrink-0">
        <Check className="size-2.5 text-success stroke-[3]" />
      </div>
    );
  }
  if (status === "warn") {
    return (
      <div className="mt-0.5 size-4 rounded-full bg-warning/15 flex items-center justify-center shrink-0">
        <AlertTriangle className="size-2.5 text-warning stroke-[3]" />
      </div>
    );
  }
  return (
    <div className="mt-0.5 size-4 rounded-full bg-surface-2 border border-border flex items-center justify-center shrink-0">
      <CircleDashed className="size-2.5 text-muted-foreground" />
    </div>
  );
}

function ReadyBadge({ ok }: { ok: boolean }) {
  if (ok) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-success/15 text-success border border-success/30 px-2 py-0.5 text-[11px] font-medium">
        <Check className="size-2.5 stroke-[3]" />
        Ready
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 text-muted-foreground border border-border px-2 py-0.5 text-[11px] font-medium">
      <CircleAlert className="size-2.5" />
      Almost
    </span>
  );
}
