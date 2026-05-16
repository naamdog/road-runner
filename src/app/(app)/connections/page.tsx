import type { Metadata } from "next";
import { ExternalLink, Plus } from "lucide-react";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connection } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import type { Platform } from "@/lib/platforms";
import { getOrCreateBrands } from "@/lib/brands";
import { readActiveBrandCookie } from "@/lib/active-brand";
import { ConnectionsGrid, type ConnectionRow, type BrandLite } from "./connections-grid";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Accounts" };
export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const session = await requireUser();
  const userId = session.user.id;

  const brands = await getOrCreateBrands(userId);
  const activeCookie = await readActiveBrandCookie();
  const activeBrandId =
    brands.find((b) => b.id === activeCookie)?.id ??
    brands.find((b) => b.isDefault)?.id ??
    brands[0]?.id ??
    null;

  let connections: ConnectionRow[] = [];
  try {
    connections = await db
      .select({
        id: connection.id,
        platform: connection.platform,
        brandId: connection.brandId,
        accountName: connection.accountName,
        accountHandle: connection.accountHandle,
        avatarUrl: connection.avatarUrl,
        isActive: connection.isActive,
        createdAt: connection.createdAt,
      })
      .from(connection)
      .where(eq(connection.userId, userId))
      .then((rows) =>
        rows.map((r) => ({
          ...r,
          createdAt: r.createdAt.toISOString(),
        }))
      );
  } catch {
    connections = [];
  }

  const brandLite: BrandLite[] = brands.map((b) => ({
    id: b.id,
    name: b.name,
    color: b.color,
  }));

  return (
    <div className="container-page py-7 max-w-4xl">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Connect each social account once. Then post from any brand in one
            click.
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="gap-1.5">
          <Link href="/brands">
            <Plus className="size-3.5" />
            New brand
          </Link>
        </Button>
      </div>

      <ConnectionsGrid
        connections={connections}
        brands={brandLite}
        activeBrandId={activeBrandId}
      />

      <div className="mt-8 rounded-md border border-border bg-surface/40 p-4 flex items-start gap-2.5">
        <ExternalLink className="size-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground leading-relaxed">
          Road Runner only asks for permission to post videos for you. We never
          read your messages, comments, or follower data. Your tokens are
          encrypted, and you can disconnect any account any time.
        </div>
      </div>
    </div>
  );
}
