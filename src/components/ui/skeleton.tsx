import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-gradient-to-r from-surface-2 via-surface-3 to-surface-2 bg-[length:200%_100%]",
        className
      )}
      style={{ animation: "shimmer 2.4s linear infinite" }}
      {...props}
    />
  );
}
