import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 select-none active:translate-y-px",
  {
    variants: {
      variant: {
        brand:
          "bg-brand text-brand-foreground hover:bg-brand-muted shadow-[0_0_0_1px_rgba(204,255,0,0.4),0_8px_24px_-8px_rgba(204,255,0,0.5)] hover:shadow-[0_0_0_1px_rgba(204,255,0,0.6),0_12px_32px_-8px_rgba(204,255,0,0.6)]",
        default:
          "bg-surface-2 text-foreground border border-border hover:bg-surface-3 hover:border-border-strong",
        outline:
          "border border-border bg-transparent text-foreground hover:bg-surface-2 hover:border-border-strong",
        ghost:
          "bg-transparent text-foreground hover:bg-surface-2",
        destructive:
          "bg-destructive/15 text-destructive border border-destructive/30 hover:bg-destructive/25",
        link:
          "bg-transparent text-brand hover:text-brand-muted underline-offset-4 hover:underline",
      },
      size: {
        xs: "h-7 px-2.5 text-xs rounded-sm",
        sm: "h-8 px-3 text-xs rounded-md",
        md: "h-9 px-3.5 text-sm",
        lg: "h-10 px-5 text-sm",
        xl: "h-12 px-6 text-base rounded-lg",
        icon: "size-9 p-0",
        "icon-sm": "size-7 p-0 rounded-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "md",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
