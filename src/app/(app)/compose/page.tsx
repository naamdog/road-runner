import type { Metadata } from "next";
import { eq, and } from "drizzle-orm";
import { db } from "@/lib/db";
import { connection } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { ComposeForm } from "./compose-form";

export const metadata: Metadata = { title: "Compose" };
export const dynamic = "force-dynamic";

export default async function ComposePage() {
  const session = await requireUser();
  const userId = session.user.id;

  let connections: { id: string; platform: string; accountName: string }[] = [];
  try {
    connections = await db
      .select({
        id: connection.id,
        platform: connection.platform,
        accountName: connection.accountName,
      })
      .from(connection)
      .where(and(eq(connection.userId, userId), eq(connection.isActive, true)));
  } catch {
    connections = [];
  }

  const timezone = session.user.timezone || "UTC";

  return (
    <ComposeForm
      connections={connections as never}
      timezone={timezone}
    />
  );
}
