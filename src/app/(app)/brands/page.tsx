import type { Metadata } from "next";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { brand, connection } from "@/lib/db/schema";
import { requireUser } from "@/lib/session";
import { getOrCreateBrands } from "@/lib/brands";
import { readActiveBrandCookie } from "@/lib/active-brand";
import { BrandsManager } from "./brands-manager";

export const metadata: Metadata = { title: "Brands" };
export const dynamic = "force-dynamic";

export default async function BrandsPage() {
  const session = await requireUser();
  const userId = session.user.id;

  await getOrCreateBrands(userId);

  const rows = await db
    .select({
      id: brand.id,
      name: brand.name,
      color: brand.color,
      isDefault: brand.isDefault,
      sortOrder: brand.sortOrder,
      createdAt: brand.createdAt,
      accountCount: sql<number>`COUNT(${connection.id})`,
    })
    .from(brand)
    .leftJoin(
      connection,
      and(eq(connection.brandId, brand.id), eq(connection.isActive, true))
    )
    .where(eq(brand.userId, userId))
    .groupBy(brand.id)
    .orderBy(brand.sortOrder, brand.createdAt);

  const activeId = await readActiveBrandCookie();

  return (
    <div className="container-page py-7 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Brands</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Juggling more than one identity? Give each brand its own accounts,
          posts and colour, and flip between them from the top bar.
        </p>
      </div>

      <BrandsManager
        brands={rows.map((r) => ({
          id: r.id,
          name: r.name,
          color: r.color,
          isDefault: r.isDefault,
          accountCount: Number(r.accountCount),
          createdAt: r.createdAt.toISOString(),
        }))}
        activeBrandId={activeId}
      />
    </div>
  );
}
