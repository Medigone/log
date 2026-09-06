import type { ColumnDef } from "@tanstack/react-table";
import { Square, SquareCheck } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { planningStatusTone } from "@/shared/design/statusTone";
import { formatQuantity } from "@/shared/format";
import { cn } from "@/lib/utils";
import type { DeliveryNoteAssignment, DistributionRoute } from "@/shared/types/distribution";

/**
 * Columns for the "Tableau" view of the BL tab (DeliveryNotesBoard).
 * Widths are the ones measured in the mockup; the fr tracks are the only shrinkable ones.
 *
 * ⚠ Do NOT add a "dépassée" hint next to the date: at ~900px the 1fr track resolves to ~106px
 * and the text slides under the opaque Statut chip of the next column. The red date plus the
 * Statut column already carry the meaning.
 */
export function planningTableColumns({
  today,
  routes,
  selected,
  onToggle,
  onToggleAll,
  allSelected,
}: {
  today: string;
  routes: DistributionRoute[];
  selected: Set<string>;
  onToggle: (deliveryNote: string) => void;
  onToggleAll: () => void;
  allSelected: boolean;
}): ColumnDef<DeliveryNoteAssignment>[] {
  const routeByName = new Map(routes.map((route) => [route.name, route]));

  return [
    {
      id: "select",
      size: 36,
      header: () => (
        <button
          type="button"
          onClick={onToggleAll}
          aria-label={allSelected ? "Tout désélectionner" : "Tout sélectionner"}
          className="text-muted-foreground hover:text-foreground"
        >
          {allSelected ? <SquareCheck className="size-4 text-foreground" /> : <Square className="size-4" />}
        </button>
      ),
      cell: ({ row }) => {
        const on = selected.has(row.original.deliveryNote);
        return (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onToggle(row.original.deliveryNote);
            }}
            aria-label={on ? "Désélectionner" : "Sélectionner"}
            className="text-muted-foreground hover:text-foreground"
          >
            {on ? <SquareCheck className="size-4 text-foreground" /> : <Square className="size-4" />}
          </button>
        );
      },
    },
    {
      id: "deliveryNote",
      header: "BL · Client",
      cell: ({ row }) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-mono text-[12.5px] font-medium">{row.original.deliveryNote}</span>
          <span className="truncate text-[11px] text-muted-foreground">{row.original.customerName}</span>
        </div>
      ),
    },
    {
      id: "place",
      header: "Lieu",
      cell: ({ row }) => (
        <span className="truncate text-[12.5px] text-muted-foreground">
          {[row.original.commune, row.original.wilaya].filter(Boolean).join(", ") || "—"}
        </span>
      ),
    },
    {
      id: "requestedDate",
      header: "Livraison souhaitée",
      cell: ({ row }) => {
        const date = row.original.requestedDate || "";
        const late = !row.original.route && Boolean(date) && date < today;
        return (
          <span
            className={cn(
              "truncate whitespace-nowrap font-mono text-xs",
              late ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {date || "—"}
          </span>
        );
      },
    },
    {
      id: "planningStatus",
      header: "Statut",
      size: 104,
      cell: ({ row }) => (
        <StatusBadge tone={planningStatusTone(row.original.planningStatus)} size="sm">
          {row.original.planningStatus}
        </StatusBadge>
      ),
    },
    {
      id: "articles",
      header: "Art.",
      size: 74,
      meta: { align: "right" },
      cell: ({ row }) => (
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {formatQuantity(row.original.totalQuantity)}
        </span>
      ),
    },
    {
      id: "route",
      header: "Tournée",
      size: 130,
      cell: ({ row }) =>
        row.original.route ? (
          <span className="truncate font-mono text-[11.5px]">{row.original.route}</span>
        ) : (
          <span className="text-muted-foreground/50">—</span>
        ),
    },
    {
      id: "driver",
      header: "Livreur · Créneau",
      cell: ({ row }) => {
        const route = row.original.route ? routeByName.get(row.original.route) : undefined;
        if (!route) return <span className="text-muted-foreground/50">—</span>;
        const slot = [route.plannedStart, route.plannedEnd]
          .map((value) => (value ? value.slice(11, 16) : ""))
          .filter(Boolean)
          .join(" – ");
        return (
          <span className="truncate text-xs text-muted-foreground">
            {[route.driverName ?? route.driver, slot].filter(Boolean).join(" · ")}
          </span>
        );
      },
    },
  ];
}
