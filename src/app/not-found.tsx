import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { LogoMark } from "@/components/logo";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-6 bg-background">
      <div
        aria-hidden
        className="absolute inset-0 bg-grid opacity-[0.25] [mask-image:radial-gradient(circle_at_center,black_20%,transparent_70%)] pointer-events-none"
      />
      <div className="relative text-center">
        <LogoMark size={72} className="mx-auto" />
        <h1 className="mt-6 text-7xl md:text-8xl font-semibold tracking-[-0.04em] gradient-brand">
          404
        </h1>
        <p className="mt-4 text-xl font-medium">Got off the road.</p>
        <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">
          We couldn't find that page. The URL might be old, or it never existed.
        </p>
        <div className="mt-7 flex items-center justify-center gap-2">
          <Button asChild variant="brand" size="lg">
            <Link href="/" className="gap-2">
              <ArrowLeft className="size-4" />
              Back home
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
