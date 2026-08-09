import type { Metadata } from "next";
import { Card } from "@/components/ui/card";
import { getAccounts, getSchedule, PLATFORM_COLOR, PLATFORM_LABEL, type Platform } from "@/lib/blotato";

export const metadata: Metadata = { title: "Accounts" };
export const dynamic = "force-dynamic";

const ALL: Platform[] = ["instagram", "youtube", "tiktok", "facebook", "linkedin"];

export default async function AccountsPage() {
  let accounts: Awaited<ReturnType<typeof getAccounts>> = [];
  let counts = new Map<string, number>();
  let error: string | null = null;
  try {
    const [a, schedule] = await Promise.all([getAccounts(), getSchedule()]);
    accounts = a;
    for (const s of schedule) counts.set(s.platform, (counts.get(s.platform) ?? 0) + 1);
  } catch (e) {
    error = e instanceof Error ? e.message : "Could not reach Blotato";
  }

  return (
    <div className="container-page py-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Accounts</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-prose">
          The platforms Blotato posts to. Connecting and disconnecting happens in
          Blotato — it holds the logins, which is why Road Runner no longer needs to.
        </p>
      </div>

      {error ? (
        <Card className="p-6 border-destructive/40 bg-destructive/5">
          <p className="text-sm">Couldn&apos;t load accounts: {error}</p>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {ALL.map((p) => {
            const conn = accounts.filter((a) => a.platform === p);
            const queued = counts.get(p) ?? 0;
            return (
              <Card key={p} className="p-5">
                <div className="flex items-start gap-3">
                  <span
                    className="size-9 rounded-md grid place-items-center shrink-0 border"
                    style={{
                      background: `${PLATFORM_COLOR[p]}1a`,
                      borderColor: `${PLATFORM_COLOR[p]}55`,
                    }}
                  >
                    <span className="size-2.5 rounded-full" style={{ background: PLATFORM_COLOR[p] }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-sm font-semibold">{PLATFORM_LABEL[p]}</h2>
                    {conn.length > 0 ? (
                      <>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {conn.map((c) => c.username || c.fullname || c.id).join(", ")}
                        </p>
                        <p className="text-xs mt-2 tabular-nums">
                          <span className="text-foreground font-medium">{queued}</span>
                          <span className="text-muted-foreground"> posts queued</span>
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Not connected — add it in Blotato to post here.
                      </p>
                    )}
                  </div>
                  <span
                    className={
                      conn.length
                        ? "text-[10px] font-medium px-2 py-0.5 rounded-full bg-success/15 text-success border border-success/30 shrink-0"
                        : "text-[10px] font-medium px-2 py-0.5 rounded-full bg-surface-2 text-muted-foreground border border-border shrink-0"
                    }
                  >
                    {conn.length ? "Connected" : "Off"}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
