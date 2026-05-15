import Link from "next/link";
import { ArrowRight, Calendar, Check, Clock, Sparkles, Upload, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PlatformIcon } from "@/components/platform-icon";
import { PLATFORMS, PLATFORM_META } from "@/lib/platforms";
import { LogoMark } from "@/components/logo";

export default function LandingPage() {
  return (
    <>
      <Hero />
      <Platforms />
      <HowItWorks />
      <Features />
      <Pricing />
      <CtaBand />
    </>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden pt-20 md:pt-28 pb-24">
      <div className="absolute inset-0 bg-grid opacity-[0.35] [mask-image:radial-gradient(circle_at_center,black_30%,transparent_75%)] pointer-events-none" />
      <div
        aria-hidden
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[900px] rounded-full bg-brand/[0.06] blur-3xl pointer-events-none"
      />
      <div className="container-page relative">
        <div className="flex flex-col items-center text-center max-w-4xl mx-auto">
          <Link
            href="/sign-up"
            className="inline-flex items-center gap-2 rounded-full border border-border bg-surface/80 backdrop-blur px-3 py-1 text-xs hover:border-brand/40 transition-colors group"
          >
            <span className="size-1.5 rounded-full bg-brand animate-pulse" />
            <span className="text-muted-foreground group-hover:text-foreground transition-colors">
              Built for creators who post on cadence
            </span>
            <ArrowRight className="size-3 text-muted-foreground" />
          </Link>

          <h1 className="mt-7 text-5xl md:text-7xl lg:text-8xl font-semibold tracking-[-0.04em] leading-[0.95]">
            Schedule <span className="gradient-brand">once</span>.
            <br />
            Run everywhere.
          </h1>

          <p className="mt-6 max-w-2xl text-lg md:text-xl text-muted-foreground leading-relaxed">
            One short video. One caption. Five platforms, five different times —
            posted automatically. Road Runner is the fastest scheduler for short-form,
            and only short-form.
          </p>

          <div className="mt-9 flex flex-col sm:flex-row items-center gap-3">
            <Button asChild variant="brand" size="xl">
              <Link href="/sign-up" className="gap-2">
                Start free
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="xl">
              <Link href="#how-it-works">See how it works</Link>
            </Button>
          </div>

          <p className="mt-4 text-xs text-subtle-foreground">
            No credit card. Email & password sign-up. Cancel anytime.
          </p>
        </div>

        <HeroPreview />
      </div>
    </section>
  );
}

function HeroPreview() {
  return (
    <div className="relative mt-16 mx-auto max-w-5xl">
      <div className="absolute inset-x-0 -bottom-10 h-40 bg-brand/[0.06] blur-3xl pointer-events-none" />
      <div className="relative rounded-2xl border border-border bg-surface/70 backdrop-blur shadow-pop overflow-hidden">
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border bg-surface-2/60">
          <div className="size-2.5 rounded-full bg-destructive/60" />
          <div className="size-2.5 rounded-full bg-warning/60" />
          <div className="size-2.5 rounded-full bg-success/60" />
          <div className="ml-3 text-xs text-subtle-foreground font-mono">road-runner.app/compose</div>
        </div>
        <div className="p-4 md:p-6 grid md:grid-cols-[280px_1fr] gap-5">
          {/* Mock video preview */}
          <div className="aspect-[9/16] rounded-lg border border-border bg-gradient-to-br from-surface-3 via-surface-2 to-surface relative overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center">
              <LogoMark size={88} />
            </div>
            <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2">
              <div className="size-7 rounded-full bg-surface/80 backdrop-blur flex items-center justify-center">
                <Sparkles className="size-3.5 text-brand" />
              </div>
              <div className="flex-1 h-1 rounded-full bg-surface/60">
                <div className="h-full w-2/3 rounded-full bg-brand" />
              </div>
              <span className="text-[10px] text-foreground/80 font-mono tabular-nums">00:32</span>
            </div>
          </div>
          {/* Mock scheduling grid */}
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-surface-2/40 p-3">
              <div className="text-xs uppercase tracking-wider text-subtle-foreground mb-1.5">
                Caption · one for all
              </div>
              <p className="text-sm text-foreground/90 leading-relaxed">
                The 4 daily habits that 10x'd my output this year. Pick the one you'll
                start with today. #productivity #shorts
              </p>
            </div>
            <div className="rounded-md border border-border bg-surface-2/40 p-3 space-y-2">
              <div className="text-xs uppercase tracking-wider text-subtle-foreground mb-1">
                Schedule per platform
              </div>
              {PLATFORMS.map((p, i) => {
                const meta = PLATFORM_META[p];
                const times = ["Mon 8:00", "Tue 12:30", "Wed 18:00", "Thu 7:45", "Fri 17:00"];
                return (
                  <div key={p} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <PlatformIcon platform={p} size={16} />
                      <span className="text-sm text-foreground truncate">{meta.shortName}</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono tabular-nums">
                      <Clock className="size-3" />
                      {times[i]}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center justify-end">
              <div className="inline-flex items-center gap-1.5 rounded-md bg-brand text-brand-foreground px-3 py-1.5 text-xs font-medium shadow-glow">
                <Zap className="size-3.5" />
                Schedule all 5
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Platforms() {
  return (
    <section className="py-16 border-y border-border/60 bg-surface/30">
      <div className="container-page">
        <p className="text-center text-xs uppercase tracking-[0.2em] text-subtle-foreground">
          Built for the five platforms that matter for short-form
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-x-10 gap-y-5">
          {PLATFORMS.map((p) => (
            <div key={p} className="flex items-center gap-2.5 text-foreground/80 hover:text-foreground transition-colors">
              <PlatformIcon platform={p} size={22} />
              <span className="text-sm font-medium">{PLATFORM_META[p].name}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "01",
      icon: Upload,
      title: "Drop in your vertical short.",
      body: "MP4, MOV, up to 90 seconds, up to 1 GB. We handle the rest.",
    },
    {
      n: "02",
      icon: Sparkles,
      title: "Write one caption.",
      body: "Same hook, same hashtags, same energy — pre-flighted against each platform's limits.",
    },
    {
      n: "03",
      icon: Calendar,
      title: "Pick a time per platform.",
      body: "Stagger across days and times to maximize reach without flooding your audience.",
    },
  ];
  return (
    <section id="how-it-works" className="py-24">
      <div className="container-page">
        <SectionHeader
          eyebrow="How it works"
          title="From upload to scheduled in 60 seconds."
          description="No multi-step wizard. No copy-paste loop. One screen, three decisions."
        />
        <div className="mt-12 grid md:grid-cols-3 gap-4">
          {steps.map((s) => {
            const Icon = s.icon;
            return (
              <div
                key={s.n}
                className="group relative rounded-xl border border-border bg-surface/60 p-6 hover:border-brand/40 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div className="size-9 rounded-md border border-border bg-surface-2 flex items-center justify-center">
                    <Icon className="size-4 text-brand" />
                  </div>
                  <span className="font-mono text-xs text-subtle-foreground">{s.n}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-tight">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{s.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Features() {
  const features = [
    {
      title: "One caption, every platform.",
      body: "Write it once. We pre-flight character counts, hashtag caps, and content rules per platform.",
    },
    {
      title: "Stagger times in seconds.",
      body: "Schedule the same short to all 5 platforms at different times — drag, click, type. Done.",
    },
    {
      title: "Timezone-aware scheduling.",
      body: "Your local time. We handle DST, conversions, and weird platform quirks.",
    },
    {
      title: "Retry with backoff.",
      body: "Failed post? We retry up to 3 times with exponential backoff before paging you.",
    },
    {
      title: "Calendar + list views.",
      body: "See your week at a glance, or your queue as a feed. Reschedule with one click.",
    },
    {
      title: "Keyboard-first.",
      body: "Cmd+K opens the command palette. Compose, search, jump — all from your keys.",
    },
  ];
  return (
    <section id="features" className="py-24 border-t border-border/60">
      <div className="container-page">
        <SectionHeader
          eyebrow="Features"
          title="Focused. Fast. Stupidly simple."
          description="No long-form posts. No threads. No stories. Just short-form video, done right."
        />
        <div className="mt-12 grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {features.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-border bg-surface/50 p-5 hover:bg-surface/80 transition-colors"
            >
              <div className="size-1.5 rounded-full bg-brand" />
              <h3 className="mt-4 text-base font-semibold tracking-tight">{f.title}</h3>
              <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  return (
    <section id="pricing" className="py-24 border-t border-border/60">
      <div className="container-page">
        <SectionHeader
          eyebrow="Pricing"
          title="Free to start. Honest pricing."
          description="No seat tax. No platform tax. Pay for what you use."
        />
        <div className="mt-12 grid md:grid-cols-2 gap-4 max-w-3xl mx-auto">
          <PriceCard
            name="Starter"
            price="Free"
            description="For solo creators getting started."
            features={[
              "Up to 10 scheduled posts / month",
              "All 5 platforms",
              "Calendar + list views",
              "Email support",
            ]}
            cta="Start free"
          />
          <PriceCard
            name="Pro"
            price="$19"
            priceSuffix="/mo"
            description="For creators publishing daily."
            featured
            features={[
              "Unlimited scheduled posts",
              "All 5 platforms",
              "Multiple accounts per platform",
              "Retry analytics + failure alerts",
              "Priority support",
            ]}
            cta="Start free trial"
          />
        </div>
      </div>
    </section>
  );
}

function PriceCard({
  name,
  price,
  priceSuffix,
  description,
  features,
  cta,
  featured,
}: {
  name: string;
  price: string;
  priceSuffix?: string;
  description: string;
  features: string[];
  cta: string;
  featured?: boolean;
}) {
  return (
    <div
      className={`relative rounded-2xl border p-6 ${
        featured
          ? "border-brand/50 bg-brand/[0.04] shadow-[0_0_0_1px_rgba(204,255,0,0.12)]"
          : "border-border bg-surface/50"
      }`}
    >
      {featured ? (
        <div className="absolute -top-2.5 left-6">
          <Badge variant="brand">Most popular</Badge>
        </div>
      ) : null}
      <h3 className="text-base font-semibold">{name}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-5 flex items-baseline gap-1">
        <span className="text-4xl font-semibold tracking-tight">{price}</span>
        {priceSuffix ? (
          <span className="text-sm text-muted-foreground">{priceSuffix}</span>
        ) : null}
      </div>
      <Button
        asChild
        variant={featured ? "brand" : "default"}
        size="lg"
        className="mt-6 w-full"
      >
        <Link href="/sign-up">{cta}</Link>
      </Button>
      <ul className="mt-6 space-y-2.5">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
            <Check className="size-4 text-brand mt-0.5 shrink-0" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CtaBand() {
  return (
    <section className="py-24 relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-x-0 inset-y-10 mx-auto max-w-4xl rounded-3xl bg-brand/[0.07] blur-3xl pointer-events-none"
      />
      <div className="container-page relative">
        <div className="mx-auto max-w-3xl text-center rounded-2xl border border-border bg-surface/70 backdrop-blur p-10 md:p-14">
          <h2 className="text-3xl md:text-5xl font-semibold tracking-tight leading-tight">
            Stop juggling five apps.
            <br />
            <span className="gradient-brand">Start running everywhere.</span>
          </h2>
          <p className="mt-4 text-muted-foreground max-w-xl mx-auto">
            Set up your account in under two minutes. Connect your platforms. Ship
            your first cross-platform short tonight.
          </p>
          <div className="mt-7">
            <Button asChild variant="brand" size="xl">
              <Link href="/sign-up" className="gap-2">
                Get started — it's free
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}

function SectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="text-center max-w-3xl mx-auto">
      <p className="text-xs uppercase tracking-[0.2em] text-brand font-medium">{eyebrow}</p>
      <h2 className="mt-3 text-3xl md:text-5xl font-semibold tracking-tight leading-tight">
        {title}
      </h2>
      <p className="mt-4 text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}
