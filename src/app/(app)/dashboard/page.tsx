import Link from "next/link";
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  Link2,
  Plus,
  Sparkles,
  Timer,
  TrendingUp,
} from "lucide-react";
import type { Metadata } from "next";
import { and, count, eq, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { post, postTarget, connection } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PlatformIcon } from "@/components/platform-icon";
import { PLATFORM_META, type Platform } from "@/lib/platforms";
import { Separator } from "@/components/ui/separator";

export const metadata: Metadata = { title: "Dashboard" };
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await requireUser();
  const userId = session.user.id;

  const [stats, upcoming, recentPublished, connections] = await Promise.all([
    getStats(userId),
    getUpcoming(userId),
    getRecentPublished(userId),
    getConnections(userId),
  ]);

  const firstName = session.user.name.split(" ")[0];

  return (
    <div className="container-page py-8 max-w-6xl">
      <div className="flex items-start justify-between gap-4 mb-7">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {greeting()}, {firstName}.
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Here's what's running today.
          </p>
        </div>
        <Button asChild variant="brand">
          <Link href="/compose" className="gap-1.5">
            <Plus className="size-4" />
            New short
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          icon={CalendarDays}
          label="Scheduled"
          value={stats.scheduled}
          accent
        />
        <StatCard
          icon={CheckCircle2}
          label="Published (7d)"
          value={stats.published7d}
        />
        <StatCard
          icon={Link2}
          label="Connections"
          value={stats.connections}
          href="/connections"
        />
        <StatCard
          icon={TrendingUp}
          label="Posts (30d)"
          value={stats.published30d}
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-5 mt-7">
        {/* Upcoming */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between p-5 pb-3">
            <div>
              <h2 className="text-base font-semibold tracking-tight">Up next</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Your next 8 scheduled posts.
              </p>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href="/scheduled" className="gap-1">
                View all
                <ArrowUpRight className="size-3.5" />
              </Link>
            </Button>
          </div>
          <Separator />
          <CardContent className="p-0">
            {upcoming.length === 0 ? (
              <EmptyState
                icon={Timer}
                title="Nothing scheduled yet"
                description="Drop a short, write a caption, pick your times. Done."
                actionLabel="Create your first short"
                actionHref="/compose"
              />
            ) : (
              <ul className="divide-y divide-border">
                {upcoming.map((row) => (
                  <li key={row.id} className="flex items-center gap-3 px-5 py-3.5">
                    <PlatformIcon platform={row.platform} size={22} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-foreground truncate">
                        {row.caption || (
                          <span className="text-subtle-foreground italic">
                            (no caption)
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {PLATFORM_META[row.platform].name}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-sm tabular-nums">
                        {formatTime(row.scheduledAt)}
                      </div>
                      <div className="text-xs text-muted-foreground tabular-nums">
                        {formatDate(row.scheduledAt)}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Connections */}
        <div className="space-y-5">
          <Card>
            <div className="flex items-center justify-between p-5 pb-3">
              <div>
                <h2 className="text-base font-semibold tracking-tight">
                  Connections
                </h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Platforms you can post to.
                </p>
              </div>
            </div>
            <Separator />
            <CardContent className="p-3">
              {(["youtube", "instagram", "tiktok", "linkedin", "facebook"] as Platform[]).map(
                (p) => {
                  const meta = PLATFORM_META[p];
                  const conn = connections.find((c) => c.platform === p);
                  return (
                    <Link
                      key={p}
                      href="/connections"
                      className="flex items-center gap-3 px-2 py-2 rounded-md hover:bg-surface-2 transition-colors"
                    >
                      <PlatformIcon platform={p} size={20} />
                      <span className="text-sm flex-1 truncate">{meta.shortName}</span>
                      {conn ? (
                        <Badge variant="success">Connected</Badge>
                      ) : (
                        <Badge variant="muted">Connect</Badge>
                      )}
                    </Link>
                  );
                }
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="size-9 rounded-md bg-brand/10 border border-brand/30 flex items-center justify-center shrink-0">
                  <Sparkles className="size-4 text-brand" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold">Tip</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                    Stagger your platforms by 2–6 hours. The same hook lands
                    fresh for each audience.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Recent */}
      {recentPublished.length > 0 ? (
        <div className="mt-7">
          <h2 className="text-base font-semibold tracking-tight mb-3">
            Recently published
          </h2>
          <Card>
            <CardContent className="p-0">
              <ul className="divide-y divide-border">
                {recentPublished.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center gap-3 px-5 py-3.5"
                  >
                    <PlatformIcon platform={row.platform} size={22} />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-foreground truncate">
                        {row.caption || (
                          <span className="text-subtle-foreground italic">
                            (no caption)
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {row.publishedAt
                          ? `Published ${formatDate(row.publishedAt)}`
                          : "Published"}
                      </div>
                    </div>
                    {row.publishedUrl ? (
                      <a
                        href={row.publishedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-brand hover:underline shrink-0"
                      >
                        View ↗
                      </a>
                    ) : null}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
  href,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  accent?: boolean;
  href?: string;
}) {
  const inner = (
    <div className="flex items-start justify-between">
      <div>
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div className="text-3xl font-semibold tracking-tight tabular-nums mt-2">
          {value}
        </div>
      </div>
      <div
        className={
          accent
            ? "size-8 rounded-md bg-brand/15 border border-brand/30 flex items-center justify-center"
            : "size-8 rounded-md bg-surface-2 border border-border flex items-center justify-center"
        }
      >
        <Icon className={accent ? "size-4 text-brand" : "size-4 text-muted-foreground"} />
      </div>
    </div>
  );
  return (
    <Card className="p-5 transition-colors hover:bg-surface-2/40">
      {href ? (
        <Link href={href} className="block">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </Card>
  );
}

function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  actionHref,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
}) {
  return (
    <div className="px-6 py-10 text-center">
      <div className="size-11 mx-auto rounded-md bg-surface-2 border border-border flex items-center justify-center">
        <Icon className="size-5 text-muted-foreground" />
      </div>
      <h3 className="mt-4 text-sm font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">
        {description}
      </p>
      <Button asChild variant="brand" size="sm" className="mt-4">
        <Link href={actionHref}>{actionLabel}</Link>
      </Button>
    </div>
  );
}

function greeting() {
  const h = new Date().getHours();
  if (h < 5) return "Up late";
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatTime(d: Date) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

function formatDate(d: Date) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(d);
}

// --- Queries ---

async function getStats(userId: string) {
  try {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const [[scheduledRow], [publishedRow7], [publishedRow30], [connectionsRow]] =
      await Promise.all([
        db
          .select({ c: count() })
          .from(postTarget)
          .where(
            and(eq(postTarget.userId, userId), eq(postTarget.status, "scheduled"))
          ),
        db
          .select({ c: count() })
          .from(postTarget)
          .where(
            and(
              eq(postTarget.userId, userId),
              eq(postTarget.status, "published"),
              gte(postTarget.publishedAt, sevenDaysAgo)
            )
          ),
        db
          .select({ c: count() })
          .from(postTarget)
          .where(
            and(
              eq(postTarget.userId, userId),
              eq(postTarget.status, "published"),
              gte(postTarget.publishedAt, thirtyDaysAgo)
            )
          ),
        db
          .select({ c: count() })
          .from(connection)
          .where(
            and(eq(connection.userId, userId), eq(connection.isActive, true))
          ),
      ]);

    return {
      scheduled: Number(scheduledRow?.c ?? 0),
      published7d: Number(publishedRow7?.c ?? 0),
      published30d: Number(publishedRow30?.c ?? 0),
      connections: Number(connectionsRow?.c ?? 0),
    };
  } catch {
    return { scheduled: 0, published7d: 0, published30d: 0, connections: 0 };
  }
}

async function getUpcoming(userId: string) {
  try {
    const rows = await db
      .select({
        id: postTarget.id,
        platform: postTarget.platform,
        scheduledAt: postTarget.scheduledAt,
        caption: post.caption,
      })
      .from(postTarget)
      .innerJoin(post, eq(postTarget.postId, post.id))
      .where(
        and(eq(postTarget.userId, userId), eq(postTarget.status, "scheduled"))
      )
      .orderBy(sql`${postTarget.scheduledAt} ASC`)
      .limit(8);
    return rows;
  } catch {
    return [];
  }
}

async function getRecentPublished(userId: string) {
  try {
    const rows = await db
      .select({
        id: postTarget.id,
        platform: postTarget.platform,
        publishedAt: postTarget.publishedAt,
        publishedUrl: postTarget.publishedUrl,
        caption: post.caption,
      })
      .from(postTarget)
      .innerJoin(post, eq(postTarget.postId, post.id))
      .where(
        and(eq(postTarget.userId, userId), eq(postTarget.status, "published"))
      )
      .orderBy(sql`${postTarget.publishedAt} DESC`)
      .limit(5);
    return rows;
  } catch {
    return [];
  }
}

async function getConnections(userId: string) {
  try {
    const rows = await db
      .select({
        platform: connection.platform,
        accountName: connection.accountName,
      })
      .from(connection)
      .where(eq(connection.userId, userId));
    return rows;
  } catch {
    return [];
  }
}
