import { cn } from "@/lib/utils";

interface LogoProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: number;
  showWordmark?: boolean;
  wordmarkClassName?: string;
  variant?: "default" | "mono";
}

/**
 * Road Runner brand mark.
 *
 * Concept: two thick parallel slashes leaning forward — the visual language
 * of motion lines / speed. No road, no runner, no bird. Pure velocity glyph.
 */
export function Logo({
  size = 28,
  showWordmark = false,
  className,
  wordmarkClassName,
  variant = "default",
  ...rest
}: LogoProps) {
  const fg = variant === "mono" ? "currentColor" : "#CCFF00";
  const bg = variant === "mono" ? "transparent" : "#0A0A0B";
  const stroke = variant === "mono" ? "currentColor" : "rgba(255,255,255,0.08)";
  return (
    <div className={cn("inline-flex items-center gap-2.5", className)} {...rest}>
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect
          x="0.5"
          y="0.5"
          width="31"
          height="31"
          rx="8.5"
          fill={bg}
          stroke={stroke}
        />
        {/* Two leaning slashes — motion glyph */}
        <path
          d="M9.2 23 L13.6 9 H16.2 L11.8 23 Z"
          fill={fg}
        />
        <path
          d="M16.6 23 L21 9 H23.6 L19.2 23 Z"
          fill={fg}
        />
      </svg>
      {showWordmark ? (
        <span
          className={cn(
            "font-semibold tracking-tight text-foreground text-[15px] leading-none",
            wordmarkClassName
          )}
        >
          Road Runner
        </span>
      ) : null}
    </div>
  );
}

/** Inline glyph version for marketing — bigger and bolder. */
export function LogoMark({ size = 96, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
      className={className}
    >
      <defs>
        <linearGradient id="rr-bg" x1="0" y1="0" x2="96" y2="96" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0F1014" />
          <stop offset="100%" stopColor="#06070A" />
        </linearGradient>
        <linearGradient id="rr-fg" x1="20" y1="20" x2="76" y2="76" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#E8FF7A" />
          <stop offset="50%" stopColor="#CCFF00" />
          <stop offset="100%" stopColor="#AADC00" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="94" height="94" rx="22" fill="url(#rr-bg)" stroke="rgba(255,255,255,0.05)" />
      <path d="M27 69 L40.5 27 H48 L34.5 69 Z" fill="url(#rr-fg)" />
      <path d="M49 69 L62.5 27 H70 L56.5 69 Z" fill="url(#rr-fg)" />
    </svg>
  );
}
