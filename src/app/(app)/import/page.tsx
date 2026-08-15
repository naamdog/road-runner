import type { Metadata } from "next";
import { ImportClient } from "./import-client";

export const metadata: Metadata = { title: "Bulk import" };
export const dynamic = "force-dynamic";

export default function ImportPage() {
  return (
    <div className="container-page py-8 max-w-3xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Bulk import</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-prose">
          Schedule a batch of videos in one go. This is the one thing Blotato
          can&apos;t do from its own interface — everything else lives there.
        </p>
      </div>
      <ImportClient />
    </div>
  );
}
