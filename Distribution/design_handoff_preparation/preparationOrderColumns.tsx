import type { ColumnDef } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import type { DataGridFeatures } from "@/components/reui/data-grid/data-grid";
import { namedHeader } from "@/features/preparation/PreparationSubTableGrid";
import { ListStateIcon, listStateFromOrder } from "@/features/preparation/ListStateIcon";
import { formatShortDate } from "@/shared/format";
import { cn } from "@/lib/utils";

/**
 * Colonnes du tableau Commandes : 13 → 7.
 * — Commande + Client fusionnés, Lieu + Wilaya fusionnés
 * — colonne « Statut » commande supprimée (redondante avec l’état de liste)
 * — Prélevé = barre + « 12 / 12 · 100 % » dans une seule cellule
 *
 * `row.original` reste votre type SalesOrder ; adaptez les accès aux champs
 * (helpers déjà présents : orderPickListNames, orderPickListState, orderIsModified,
 *  stockShortages, orderReadyToComplete).
 */
export function preparationOrderColumns<T extends OrderLike>({
  today,
  selection,
  onToggle,
}: {
  today: string;
  selection: Record<string, true>;
  onToggle: (name: string) => void;
}): Array<ColumnDef<DataGridFeatures, T>> {
  return [
    {
      id: "select",
      header: () => null, // la case « tout sélectionner » vit dans l’en-tête de la Card
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
        <div className="flex min-w-0 flex-col">
          <span className="num truncate text-[12.5px] font-medium">{row.original.name}</span>
          <span className="truncate text-[11px] text-muted-foreground">
            {row.original.customer_name || row.original.customer} · {row.original.total_qty || 0} art.
          </span>
        </div>
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
            {row.original.custom_wilaya_nom || row.original.custom_wilaya || "—"}
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
      accessorFn: (row) => pickedRatio(row),
      ...namedHeader("Prélèvement"),
      cell: ({ row }) => {
        const picked = row.original.picked_qty ?? 0;
        const total = row.original.total_qty ?? 0;
        const pct = total ? Math.round((picked / total) * 100) : 0;
        return (
          <div className="flex items-center gap-2">
            <div className="h-1 min-w-[34px] flex-1 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full",
                  pct === 100 ? "bg-emerald-600" : pct === 0 ? "bg-border" : "bg-foreground",
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span
              className={cn(
                "num shrink-0 whitespace-nowrap text-[11.5px]",
                pct === 0 ? "text-muted-foreground/60" : "text-muted-foreground",
              )}
            >
              {picked} / {total} · {pct} %
            </span>
          </div>
        );
      },
      size: 150,
    },
    {
      id: "listState",
      accessorFn: (row) => row.pick_list_status || "",
      // en-tête CENTRÉ : sinon il ne s’aligne plus avec l’icône (décalage mesuré ~46px)
      header: () => <span className="block w-full text-center">État liste</span>,
      cell: ({ row }) => (
        <ListStateIcon
          state={listStateFromOrder({
            hasList: Boolean(row.original.pick_list_names?.length),
            submitted: row.original.pick_list_submitted === true,
            remaining: remainingOf(row.original),
          })}
          orderChanged={row.original.custom_order_changed}
        />
      ),
      size: 112,
      enableSorting: false,
    },
  ];
}

/** reste à prélever RÉEL : somme des lignes, jamais total - picked */
export function remainingOf(order: OrderLike) {
  return (order.items || []).reduce((sum, item) => sum + (item.remaining_qty ?? 0), 0);
}

function pickedRatio(order: OrderLike) {
  const total = order.total_qty ?? 0;
  return total ? (order.picked_qty ?? 0) / total : 0;
}

/** Contrat minimal attendu par les colonnes — à remplacer par votre type SalesOrder. */
export interface OrderLike {
  name: string;
  customer?: string;
  customer_name?: string;
  custom_commune?: string;
  custom_commune_nom?: string;
  custom_wilaya?: string;
  custom_wilaya_nom?: string;
  delivery_date?: string;
  transaction_date?: string;
  total_qty?: number;
  picked_qty?: number;
  pick_list_names?: string[];
  pick_list_status?: string;
  pick_list_submitted?: boolean;
  custom_order_changed?: boolean;
  items?: Array<{ remaining_qty?: number }>;
}
