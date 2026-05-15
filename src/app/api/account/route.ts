import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { getSession } from "@/lib/session";
import { auth } from "@/lib/auth";
import { headers as nextHeaders } from "next/headers";

export async function DELETE() {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Cascade deletes will remove posts, targets, connections, media rows.
  await db.delete(user).where(eq(user.id, session.user.id));
  await auth.api.signOut({ headers: await nextHeaders() }).catch(() => {});
  return NextResponse.json({ ok: true });
}
