import { cn } from "@/lib/utils";

/**
 * The active-brand indicator, shown in page headers. A bordered pill with the
 * brand's colour dot + name so it reads as a distinct, scannable token instead
 * of disappearing into the surrounding muted intro text. Pure (no hooks), so it
 * works in both server and client components.
 */
export function BrandChip({
  name,
  color,
  className,
}: {
  name: string;
  color: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2 py-0.5 text-xs font-medium text-foreground align-middle",
        className
      )}
    >
      <span
        className="size-2 rounded-full shrink-0"
        style={{ background: color }}
        aria-hidden
      />
      {name}
    </span>
  );
}
