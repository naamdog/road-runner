import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/session";
import { decryptSecret } from "@/lib/crypto";
import { META_PICK_COOKIE, fetchMetaProfiles } from "@/lib/meta-pages";
import { ChoosePageForm } from "./choose-page-form";

export const metadata: Metadata = { title: "Choose a Page" };
export const dynamic = "force-dynamic";

export default async function ChoosePagePage() {
  await requireUser();

  const c = await cookies();
  const raw = c.get(META_PICK_COOKIE)?.value;
  if (!raw) redirect("/connections");

  let parsed:
    | { platform: "facebook" | "instagram"; brandId: string | null; token: string }
    | null = null;
  try {
    parsed = JSON.parse(raw!);
  } catch {
    parsed = null;
  }
  if (!parsed) redirect("/connections");

  const userToken = decryptSecret(parsed!.token);
  if (!userToken) redirect("/connections");

  const profiles = await fetchMetaProfiles(parsed!.platform, userToken!);
  if (profiles.length === 0) {
    redirect(
      "/connections?error=" +
        encodeURIComponent("No Pages found — try reconnecting.")
    );
  }

  const isIg = parsed!.platform === "instagram";
  const options = profiles.map((p) => ({
    accountId: p.accountId,
    accountName: p.accountName,
    accountHandle: p.accountHandle,
    avatarUrl: p.avatarUrl,
  }));

  return (
    <div className="container-page py-8 max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">
        Pick {isIg ? "an Instagram account" : "a Facebook Page"}
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        You manage a few — choose the one you actually want to post to. Keeps
        things tidy. You can always connect another later.
      </p>
      <ChoosePageForm platform={parsed!.platform} options={options} />
    </div>
  );
}
