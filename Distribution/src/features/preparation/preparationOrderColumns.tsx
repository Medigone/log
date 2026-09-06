import type { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import type { DataGridFeatures } from "@/components/reui/data-grid/data-grid";
import { namedHeader } from "@/features/preparation/PreparationSubTableGrid";
import { ListStateIcon } from "@/features/preparation/ListStateIcon";
import {
  orderIsModified,
  type SalesOrderRow,
} from "@/shared/api/preparation";
import { orderPickListState, orderPickListStatus } from "@/shared/design/statusTone";
import { formatQuantity, formatShortDate } from "@/shared/format";
import { cn } from "@/lib/utils";

export function orderPickListNames(order: SalesOrderRow): string[] {
  if (order.pick_lists?.length) {
    return Array.from(new Set(order.pick_lists.map((pickList) => pickList.name).filter(Boolean)));
  }
  if (order.draft_pick_lists?.length) return order.draft_pick_lists;
  if (order.draft_pick_list) return [order.draft_pick_list];
  if (order.existing_pick_list) return [order.existing_pick_list];
  return [];
}

export function orderPickProgress(order: SalesOrderRow) {
  const requested = order.requested_qty ?? order.total_qty ?? 0;
  let picked = order.picked_qty ?? 0;
  if (!orderPickListNames(order).length && (order.per_picked || 0) > 0 && picked === 0) {
    picked = requested * ((order.per_picked || 0) / 100);
  }
  const percent = requested > 0 ? Math.min(100, Math.round((picked / requested) * 100)) : 0;
  return { picked, requested, percent };
}

/** Reste à prélever réel : reliquat découvert, sinon lignes hors liste. */
export function remainingOf(order: SalesOrderRow) {
  if (typeof order.uncovered_qty === "number") return order.uncovered_qty;
  const items = order.items || [];
  if (items.length) {
    return items.reduce((sum, item) => sum + (item.pick_list ? 0 : item.required || 0), 0);
  }
  const { picked, requested } = orderPickProgress(order);
  return Math.max(0, requested - picked);
}

export function listStateForOrder(order: SalesOrderRow) {
  const { label } = orderPickListStatus(orderPickListState(order), order);
  if (label === "Liste soumise") return "submitted" as const;
  if (label === "Liste partielle") return "partial" as const;
  if (label === "Liste incomplète") return "incomplete" as const;
  if (label === "Liste brouillon") return "draft" as const;
  return "none" as const;
}

export function preparationOrderColumns({
  today,
  selection,
  allFilteredSelected,
  onToggle,
  onToggleAll,
  onOpenDetail,
}: {
  today: string;
  selection: Record<string, true>;
  allFilteredSelected: boolean;
  onToggle: (name: string) => void;
  onToggleAll: () => void;
  onOpenDetail: (order: SalesOrderRow) => void;
}): Array<ColumnDef<DataGridFeatures, SalesOrderRow>> {
  return [
    {
      id: "select",
      header: () => (
        <Checkbox
          checked={allFilteredSelected}
          onCheckedChange={onToggleAll}
          aria-label="Tout sélectionner"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={Boolean(selection[row.original.name])}
          onCheckedChange={() => onToggle(row.original.name)}
          aria-label={`Sélectionner ${row.original.name}`}
          onClick={(event) => event.stopPropagation()}
        />
      ),
      size: 36,
      enableSorting: false,
      enableHiding: false,
    },
    {
      id: "order",
      accessorKey: "name",
      ...namedHeader("Commande · Client"),
      cell: ({ row }) => (
        <button
          type="button"
          className="flex min-w-0 flex-col text-left"
          onClick={() => onOpenDetail(row.original)}
        >
          <span className="num truncate text-[12.5px] font-medium">{row.original.name}</span>
          <span className="truncate text-[11px] text-muted-foreground">
            {row.original.customer_name || row.original.customer} · {formatQuantity(row.original.total_qty || 0)} art.
          </span>
        </button>
      ),
      size: 240,
      enableHiding: false,
    },
    {
      id: "place",
      accessorFn: (row) => row.custom_commune_nom || row.custom_commune || "",
      ...namedHeader("Lieu"),
      cell: ({ row }) => (
        <div className="flex min-w-0 flex-col">
          <span className="truncate text-[13px]">
            {row.original.custom_commune_nom || row.original.custom_commune || "—"}
          </span>
          <span className="truncate text-[11px] text-muted-foreground">
            {row.original.custom_wilaya || "—"}
          </span>
        </div>
      ),
      size: 160,
    },
    {
      id: "due",
      accessorFn: (row) => row.delivery_date || row.transaction_date || "",
      ...namedHeader("Échéance"),
      cell: ({ row }) => {
        const due = row.original.delivery_date || row.original.transaction_date;
        const late = Boolean(due && due < today);
        return (
          <span
            className={cn(
              "num whitespace-nowrap text-[12.5px]",
              late ? "text-destructive" : "text-muted-foreground",
            )}
          >
            {due ? formatShortDate(due) : "—"}
          </span>
        );
      },
      size: 96,
    },
    {
      id: "picking",
      accessorFn: (row) => orderPickProgress(row).percent,
      ...namedHeader("Prélèvement"),
      cell: ({ row }) => {
        const { picked, requested, percent } = orderPickProgress(row.original);
        return (
          <div className="flex min-w-0 items-center gap-2">
            <div
              role="progressbar"
              aria-label={`Prélèvement ${formatQuantity(picked)} sur ${formatQuantity(requested)}`}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={percent}
              className="h-1 min-w-[34px] flex-1 overflow-hidden rounded-full bg-muted"
            >
              <div
                className={cn(
                  "h-full",
                  percent === 100 ? "bg-emerald-600" : percent === 0 ? "bg-border" : "bg-foreground",
                )}
                style={{ width: `${percent}%` }}
              />
            </div>
            <span
              className={cn(
                "num shrink-0 whitespace-nowrap text-[11.5px]",
                percent === 0 ? "text-muted-foreground/60" : "text-muted-foreground",
              )}
            >
              {formatQuantity(picked)} / {formatQuantity(requested)} · {percent} %
            </span>
          </div>
        );
      },
      size: 150,
    },
    {
      id: "listState",
      accessorFn: (row) => listStateForOrder(row),
      header: () => <span className="block w-full text-center">État liste</span>,
      meta: { headerTitle: "État liste" },
      cell: ({ row }) => (
        <span className="flex items-center justify-center gap-1">
          <ListStateIcon
            state={listStateForOrder(row.original)}
            orderChanged={orderIsModified(row.original)}
          />
          {(row.original.stock_shortages || []).length > 0 ? (
            <span className="sr-only">Stock insuffisant</span>
          ) : null}
        </span>
      ),
      size: 112,
      enableSorting: false,
    },
  ];
}
