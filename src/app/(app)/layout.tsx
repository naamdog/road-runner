import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { AppShell } from "@/components/app-shell";
import { getOrCreateBrands } from "@/lib/brands";
import { readActiveBrandCookie } from "@/lib/active-brand";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  if (!session?.user) {
    redirect("/login");
  }

  let brands: { id: string; name: string; color: string; isDefault: boolean }[] = [];
  let activeBrandId: string | null = null;
  try {
    const rows = await getOrCreateBrands(session.user.id);
    brands = rows.map((b) => ({
      id: b.id,
      name: b.name,
      color: b.color,
      isDefault: b.isDefault,
    }));
    const cookieValue = await readActiveBrandCookie();
    activeBrandId =
      brands.find((b) => b.id === cookieValue)?.id ??
      brands.find((b) => b.isDefault)?.id ??
      brands[0]?.id ??
      null;
  } catch {
    // DB not configured yet — render the shell without brands.
  }

  return (
    <AppShell
      user={{ name: session.user.name, email: session.user.email }}
      brands={brands}
      activeBrandId={activeBrandId}
    >
      {children}
    </AppShell>
  );
}
