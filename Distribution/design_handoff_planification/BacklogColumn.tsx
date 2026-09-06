import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { KanbanBLItem } from "./kanbanHelpers";

export type BacklogGrouping = "aucun" | "date" | "wilaya";

const GROUPS: Array<{ id: BacklogGrouping; label: string }> = [
  { id: "aucun", label: "Aucun" },
  { id: "date", label: "Date" },
  { id: "wilaya", label: "Wilaya" },
];

/** Header of the "À planifier" column: count, select-all, grouping chips. */
export function BacklogHeader({
  count,
  allSelected,
  onToggleSelectAll,
  group,
  onGroupChange,
}: {
  count: number;
  allSelected: boolean;
  onToggleSelectAll: () => void;
  group: BacklogGrouping;
  onGroupChange: (group: BacklogGrouping) => void;
}) {
  return (
    <div className="flex flex-col gap-2 border-b bg-muted/40 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10.5px] uppercase tracking-wider text-muted-foreground">
          À planifier
        </span>
        <Badge className="tabular-nums">{count}</Badge>
        {count > 0 && (
          <button
            type="button"
            onClick={onToggleSelectAll}
            onPointerDown={(event) => event.stopPropagation()}
            className="ml-auto whitespace-nowrap text-[11.5px] font-medium text-muted-foreground hover:text-foreground hover:underline"
          >
            {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] text-muted-foreground">Grouper</span>
        {GROUPS.map((entry) => (
          <Button
            key={entry.id}
            type="button"
            variant={group === entry.id ? "default" : "ghost"}
            size="xs"
            className={cn("h-[22px] px-2 text-[11.5px]", group !== entry.id && "bg-muted")}
            onClick={() => onGroupChange(entry.id)}
            onPointerDown={(event) => event.stopPropagation()}
          >
            {entry.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export interface BacklogGroup {
  key: string;
  label: string;
  items: KanbanBLItem[];
}

/** Groups the (already filtered) backlog items, preserving their incoming order. */
export function useBacklogGroups(items: KanbanBLItem[], group: BacklogGrouping): BacklogGroup[] {
  return useMemo(() => {
    if (group === "aucun") return [{ key: "all", label: "", items }];
    const keyOf = (item: KanbanBLItem) =>
      group === "date"
        ? item.assignment.requestedDate || "Sans date"
        : item.assignment.wilaya || "Sans wilaya";
    const order: string[] = [];
    const buckets = new Map<string, KanbanBLItem[]>();
    for (const item of items) {
      const key = keyOf(item);
      if (!buckets.has(key)) {
        buckets.set(key, []);
        order.push(key);
      }
      buckets.get(key)!.push(item);
    }
    if (group === "date") order.sort();
    return order.map((key) => ({ key, label: key, items: buckets.get(key)! }));
  }, [items, group]);
}

export function BacklogGroupLabel({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-1.5 px-0.5">
      <span className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="h-px flex-1 bg-border" />
      <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">{count}</span>
    </div>
  );
}

export function BacklogEmptyState({ filtered }: { filtered: boolean }) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-3 py-7 text-center">
      <div className="flex size-8 items-center justify-center rounded-lg border border-dashed text-muted-foreground">
        ✓
      </div>
      <p className="text-xs font-semibold">Rien à planifier</p>
      <p className="text-[11.5px] leading-relaxed text-muted-foreground">
        {filtered
          ? "Aucun BL ne correspond à ces filtres."
          : "Tous les BL de la période sont affectés à une tournée."}
      </p>
    </div>
  );
}

/** Local grouping state, kept out of searchParams on purpose (view preference, not a filter). */
export function useBacklogGrouping(initial: BacklogGrouping = "aucun") {
  return useState<BacklogGrouping>(initial);
}
