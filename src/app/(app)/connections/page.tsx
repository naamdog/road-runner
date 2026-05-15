import type { Metadata } from "next";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { connection } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { PLATFORMS, PLATFORM_META, type Platform } from "@/lib/platforms";
import { ConnectionsGrid } from "./connections-grid";

export const metadata: Metadata = { title: "Connections" };
export const dynamic = "force-dynamic";

export default async function ConnectionsPage() {
  const session = await requireUser();
  const userId = session.user.id;

  let connections: ConnectionRow[] = [];
  try {
    connections = await db
      .select({
        id: connection.id,
        platform: connection.platform,
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

  return (
    <div className="container-page py-7 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Connections</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect each platform once. Scheduling becomes effortless.
        </p>
      </div>

      <ConnectionsGrid connections={connections} />

      <div className="mt-8 rounded-md border border-border bg-surface/40 p-4 flex items-start gap-2.5">
        <ExternalLink className="size-4 text-muted-foreground mt-0.5 shrink-0" />
        <div className="text-xs text-muted-foreground leading-relaxed">
          Road Runner only requests permission to publish video on your behalf.
          We never read your DMs, comments, or audience data. Tokens are
          encrypted at rest and you can disconnect any platform at any time.
        </div>
      </div>
    </div>
  );
}

export interface ConnectionRow {
  id: string;
  platform: Platform;
  accountName: string;
  accountHandle: string | null;
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: string;
}
