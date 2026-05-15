import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { SettingsForms } from "./settings-forms";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireUser();
  return (
    <div className="container-page py-7 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your account and preferences.
        </p>
      </div>
      <SettingsForms
        user={{
          name: session.user.name,
          email: session.user.email,
          timezone: session.user.timezone || "UTC",
        }}
      />
    </div>
  );
}
