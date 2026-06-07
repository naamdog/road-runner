import { NextRequest, NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { post, postTarget } from "@/lib/db/schema";
import { getSession } from "@/lib/session";

/**
 * DELETE a post target.
 * - default: soft-cancel (status -> "canceled"), used to cancel a scheduled post.
 * - ?remove=1: hard-delete the row entirely ("remove from view"), used to tidy
 *   up finished/published entries. This only removes Road Runner's record — it
 *   never touches the post on the platform.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { id } = await params;
  const userId = session.user.id;
  const hardDelete = new URL(req.url).searchParams.get("remove") === "1";

  if (hardDelete) {
    const [target] = await db
      .select({ postId: postTarget.postId })
      .from(postTarget)
      .where(and(eq(postTarget.id, id), eq(postTarget.userId, userId)));
    if (!target) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    await db
      .delete(postTarget)
      .where(and(eq(postTarget.id, id), eq(postTarget.userId, userId)));

    // Clean up the parent post if it has no targets left.
    const remaining = await db
      .select({ id: postTarget.id })
      .from(postTarget)
      .where(eq(postTarget.postId, target.postId));
    if (remaining.length === 0) {
      await db
        .delete(post)
        .where(and(eq(post.id, target.postId), eq(post.userId, userId)));
    }

    return NextResponse.json({ ok: true, removed: true });
  }

  const rows = await db
    .update(postTarget)
    .set({ status: "canceled", updatedAt: new Date() })
    .where(and(eq(postTarget.id, id), eq(postTarget.userId, userId)))
    .returning({ id: postTarget.id });

  if (rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
