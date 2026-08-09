import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { COOKIE, verifyToken } from "@/lib/gate";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  if (!verifyToken(jar.get(COOKIE)?.value)) {
    redirect("/login");
  }
  return <AppShell>{children}</AppShell>;
}
