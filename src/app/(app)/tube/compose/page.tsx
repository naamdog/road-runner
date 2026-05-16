import type { Metadata } from "next";
import Link from "next/link";
import { and, eq } from "drizzle-orm";
import { Tv } from "lucide-react";
import { db } from "@/lib/db";
import { connection } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { getOrCreateBrands } from "@/lib/brands";
import { readActiveBrandCookie } from "@/lib/active-brand";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TubeComposeForm, type TubeAccount } from "./tube-compose-form";

export const metadata: Metadata = { title: "New long video" };
export const dynamic = "force-dynamic";

export default async function TubeComposePage() {
  const session = await requireUser();
  const userId = session.user.id;

  const brands = await getOrCreateBrands(userId);
  const cookieValue = await readActiveBrandCookie();
  const activeBrand =
    brands.find((b) => b.id === cookieValue) ??
    brands.find((b) => b.isDefault) ??
    brands[0];

  let accounts: TubeAccount[] = [];
  try {
    if (activeBrand) {
      accounts = await db
        .select({
          id: connection.id,
          accountName: connection.accountName,
          accountHandle: connection.accountHandle,
        })
        .from(connection)
        .where(
          and(
            eq(connection.userId, userId),
            eq(connection.brandId, activeBrand.id),
            eq(connection.platform, "youtube"),
            eq(connection.isActive, true)
          )
        );
    }
  } catch {
    accounts = [];
  }

  const timezone = session.user.timezone || "UTC";

  if (accounts.length === 0) {
    return (
      <div className="container-page py-7 max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Tv className="size-5 text-brand" />
            New long video
          </h1>
        </div>
        <Card className="p-10 text-center">
          <Tv className="size-7 mx-auto text-muted-foreground" />
          <h3 className="mt-3 text-sm font-semibold">No YouTube account here</h3>
          <p className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">
            Connect a YouTube account to{" "}
            <span className="text-foreground font-medium">
              {activeBrand?.name ?? "this brand"}
            </span>{" "}
            to make long videos.
          </p>
          <Button asChild variant="brand" size="sm" className="mt-4">
            <Link href="/connections">Connect YouTube</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <TubeComposeForm
      accounts={accounts}
      activeBrand={
        activeBrand
          ? { id: activeBrand.id, name: activeBrand.name, color: activeBrand.color }
          : null
      }
      timezone={timezone}
    />
  );
}
