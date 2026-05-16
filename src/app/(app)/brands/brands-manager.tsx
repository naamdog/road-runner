"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Check,
  Edit2,
  Loader2,
  Palette,
  Plus,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { BRAND_COLORS } from "@/lib/brand-colors";
import { cn } from "@/lib/utils";

interface BrandRow {
  id: string;
  name: string;
  color: string;
  isDefault: boolean;
  accountCount: number;
  createdAt: string;
}

export function BrandsManager({
  brands,
  activeBrandId,
}: {
  brands: BrandRow[];
  activeBrandId: string | null;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function createBrand(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/brands", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Could not make brand");
      }
      setNewName("");
      toast.success("Brand made.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setCreating(false);
    }
  }

  async function patchBrand(id: string, patch: Partial<BrandRow>) {
    setPendingId(id);
    try {
      const res = await fetch(`/api/brands/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error("Could not save");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save");
    } finally {
      setPendingId(null);
    }
  }

  async function deleteBrand(id: string) {
    if (
      !window.confirm(
        "Delete this brand? Its connected social accounts will also be removed."
      )
    )
      return;
    setPendingId(id);
    try {
      const res = await fetch(`/api/brands/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Could not delete");
      }
      toast.success("Brand removed.");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <Card>
        <form onSubmit={createBrand} className="p-5 flex items-end gap-3">
          <div className="flex-1 space-y-1.5">
            <label
              htmlFor="brand-name"
              className="text-xs font-medium uppercase tracking-wider text-muted-foreground"
            >
              New brand
            </label>
            <Input
              id="brand-name"
              placeholder="e.g. Side project, Client A, Personal"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
              disabled={creating}
              maxLength={60}
            />
          </div>
          <Button
            type="submit"
            variant="brand"
            disabled={creating || !newName.trim()}
            className="gap-1.5"
          >
            {creating ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
            Make brand
          </Button>
        </form>
      </Card>

      <div className="space-y-3">
        {brands.map((b) => (
          <BrandCard
            key={b.id}
            brand={b}
            active={activeBrandId === b.id}
            pending={pendingId === b.id}
            onPatch={(patch) => patchBrand(b.id, patch)}
            onDelete={() => deleteBrand(b.id)}
            canDelete={brands.length > 1}
          />
        ))}
      </div>
    </div>
  );
}

function BrandCard({
  brand,
  active,
  pending,
  onPatch,
  onDelete,
  canDelete,
}: {
  brand: BrandRow;
  active: boolean;
  pending: boolean;
  onPatch: (patch: Partial<BrandRow>) => void;
  onDelete: () => void;
  canDelete: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(brand.name);
  const [color, setColor] = useState(brand.color);
  const [showColors, setShowColors] = useState(false);

  function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const patch: Partial<BrandRow> = {};
    if (name !== brand.name) patch.name = name;
    if (color !== brand.color) patch.color = color;
    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }
    onPatch(patch);
    setEditing(false);
  }

  return (
    <Card className="p-5">
      <div className="flex items-start gap-4">
        <button
          onClick={() => setShowColors((v) => !v)}
          className="size-10 rounded-md border border-border shrink-0 hover:ring-2 hover:ring-brand/30 transition-shadow"
          style={{ background: brand.color }}
          aria-label="Change color"
        />

        <div className="flex-1 min-w-0">
          {editing ? (
            <form onSubmit={save} className="flex gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                maxLength={60}
              />
              <Button type="submit" size="sm" variant="brand">
                Save
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setName(brand.name);
                  setEditing(false);
                }}
              >
                Cancel
              </Button>
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold tracking-tight">
                {brand.name}
              </h3>
              {brand.isDefault ? (
                <Badge variant="brand" className="gap-1">
                  <Star className="size-2.5" />
                  Default
                </Badge>
              ) : null}
              {active ? <Badge variant="success">Current</Badge> : null}
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-1">
            {brand.accountCount === 0
              ? "No social accounts yet"
              : `${brand.accountCount} social account${brand.accountCount === 1 ? "" : "s"}`}
            {" · "}
            <Link
              href="/connections"
              className="text-foreground hover:underline underline-offset-4"
            >
              Manage accounts →
            </Link>
          </p>
        </div>

        {!editing ? (
          <div className="flex items-center gap-1 shrink-0">
            {!brand.isDefault ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onPatch({ isDefault: true })}
                disabled={pending}
                title="Make default"
              >
                <Star className="size-3.5" />
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing(true)}
              disabled={pending}
              title="Rename"
            >
              <Edit2 className="size-3.5" />
            </Button>
            {canDelete ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={onDelete}
                disabled={pending}
                className="text-destructive hover:text-destructive"
                title="Delete brand"
              >
                {pending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      {showColors ? (
        <>
          <Separator className="my-4" />
          <div className="flex items-center gap-2 flex-wrap">
            <Palette className="size-3.5 text-muted-foreground" />
            {BRAND_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setColor(c);
                  onPatch({ color: c });
                  setShowColors(false);
                }}
                className={cn(
                  "size-7 rounded-md border border-border transition-all",
                  brand.color.toLowerCase() === c.toLowerCase()
                    ? "ring-2 ring-foreground"
                    : "hover:ring-2 hover:ring-border-strong"
                )}
                style={{ background: c }}
                title={c}
              >
                {brand.color.toLowerCase() === c.toLowerCase() ? (
                  <Check className="size-3.5 m-auto text-brand-foreground" />
                ) : null}
              </button>
            ))}
          </div>
        </>
      ) : null}
    </Card>
  );
}
