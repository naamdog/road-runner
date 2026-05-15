"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { authClient } from "@/lib/auth-client";

const TIMEZONES = [
  "UTC",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export function SettingsForms({
  user,
}: {
  user: { name: string; email: string; timezone: string };
}) {
  const router = useRouter();
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPw, setSavingPw] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name") || "");
    const timezone = String(fd.get("timezone") || "UTC");

    setSavingProfile(true);
    try {
      await authClient.updateUser({ name, timezone });
      toast.success("Profile updated.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const currentPassword = String(fd.get("current") || "");
    const newPassword = String(fd.get("new") || "");
    if (newPassword.length < 8) {
      toast.error("New password must be at least 8 characters.");
      return;
    }
    setSavingPw(true);
    try {
      await authClient.changePassword({ currentPassword, newPassword });
      toast.success("Password changed.");
      (e.target as HTMLFormElement).reset();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not change password.");
    } finally {
      setSavingPw(false);
    }
  }

  async function deleteAccount() {
    if (
      !window.confirm(
        "This will permanently delete your account, scheduled posts, and connections. Type your email at the next prompt to confirm."
      )
    )
      return;
    const v = window.prompt("Type your email to confirm:");
    if (v !== user.email) {
      toast.error("Email did not match.");
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/account", { method: "DELETE" });
      if (!res.ok) throw new Error("Could not delete account.");
      toast.success("Account deleted.");
      router.push("/");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <form onSubmit={saveProfile}>
          <div className="p-5 pb-3">
            <h2 className="text-base font-semibold tracking-tight">Profile</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Your name and timezone.
            </p>
          </div>
          <Separator />
          <CardContent className="p-5 pt-5 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  name="name"
                  defaultValue={user.name}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={user.email}
                  disabled
                  className="opacity-70 cursor-not-allowed"
                />
              </div>
            </div>
            <div className="space-y-1.5 max-w-sm">
              <Label htmlFor="timezone">Timezone</Label>
              <select
                id="timezone"
                name="timezone"
                defaultValue={user.timezone}
                className="h-9 w-full rounded-md border border-border bg-surface px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 focus-visible:border-brand/60 [color-scheme:dark]"
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                All scheduling will use this timezone unless you set a per-post override.
              </p>
            </div>
          </CardContent>
          <div className="flex justify-end p-5 pt-0">
            <Button type="submit" variant="brand" disabled={savingProfile}>
              {savingProfile ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save changes"
              )}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <form onSubmit={changePassword}>
          <div className="p-5 pb-3">
            <h2 className="text-base font-semibold tracking-tight">
              Change password
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Use at least 8 characters.
            </p>
          </div>
          <Separator />
          <CardContent className="p-5 space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="current">Current password</Label>
                <Input
                  id="current"
                  name="current"
                  type="password"
                  autoComplete="current-password"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="new">New password</Label>
                <Input
                  id="new"
                  name="new"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={8}
                />
              </div>
            </div>
          </CardContent>
          <div className="flex justify-end p-5 pt-0">
            <Button type="submit" variant="default" disabled={savingPw}>
              {savingPw ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Updating…
                </>
              ) : (
                "Change password"
              )}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="border-destructive/30">
        <div className="p-5 pb-3 flex items-center gap-2">
          <AlertTriangle className="size-4 text-destructive" />
          <h2 className="text-base font-semibold tracking-tight text-destructive">
            Danger zone
          </h2>
        </div>
        <Separator />
        <CardContent className="p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium">Delete account</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Permanently delete your account, scheduled posts, and platform
              connections. This cannot be undone.
            </p>
          </div>
          <Button
            variant="destructive"
            onClick={deleteAccount}
            disabled={deleting}
          >
            {deleting ? <Loader2 className="size-4 animate-spin" /> : null}
            Delete account
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
