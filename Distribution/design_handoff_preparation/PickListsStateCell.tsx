import type { ColumnDef } from "@tanstack/react-table";
import type { DataGridFeatures } from "@/components/reui/data-grid/data-grid";
import { namedHeader } from "@/features/preparation/PreparationSubTableGrid";
import { ListStateIcon, listStateFromDocstatus } from "@/features/preparation/ListStateIcon";
import type { RecentPickList } from "@/shared/api/preparation";
import { formatDateTime, formatQuantity } from "@/shared/format";
import { cn } from "@/lib/utils";

/**
 * Remplacements ciblés dans les colonnes de PickListQueue.
 * Le reste des colonnes (Liste, Entrepôt, Client, Wilaya, Commandes) est inchangé.
 */

/** Colonne « État » : badge texte → icône centrée (+ ⚠ commande modifiée). */
export const pickListStateColumn: ColumnDef<DataGridFeatures, RecentPickList> = {
  id: "status",
  accessorKey: "docstatus",
  // en-tête centré pour rester aligné sur l’icône
  header: () => <span className="block w-full text-center">État</span>,
  cell: ({ row }) => (
    <ListStateIcon
      state={listStateFromDocstatus(row.original.docstatus)}
      orderChanged={row.original.custom_order_changed}
    />
  ),
  size: 72,
  enableSorting: false,
};

/** Colonne « Prélevé » : barre + valeur, la valeur reste insécable. */
export const pickListProgressColumn: ColumnDef<DataGridFeatures, RecentPickList> = {
  id: "progress",
  accessorFn: (row) => {
    const requested = row.requested_qty ?? 0;
    return requested ? (row.picked_qty ?? 0) / requested : 0;
  },
  ...namedHeader("Prélevé"),
  cell: ({ row }) => {
    const picked = row.original.picked_qty ?? 0;
    const requested = row.original.requested_qty ?? 0;
    const pct = requested ? Math.round((picked / requested) * 100) : 0;
    return (
      <div className="flex items-center gap-2">
        <div className="h-1 min-w-[30px] flex-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full",
              pct === 100 ? "bg-emerald-600" : pct === 0 ? "bg-border" : "bg-foreground",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="num shrink-0 whitespace-nowrap tabular-nums text-[11.5px] text-muted-foreground">
          {formatQuantity(picked)} / {formatQuantity(requested)}
        </span>
      </div>
    );
  },
  size: 140,
};

/**
 * Colonne « Modifié » : padding gauche OBLIGATOIRE.
 * Sans lui, « 12 / 12 » (aligné à droite) et « 05/09/2026 14:02 » se collent et se lisent
 * comme une seule chaîne — les deux sont en Geist Mono.
 */
export const pickListModifiedColumn: ColumnDef<DataGridFeatures, RecentPickList> = {
  id: "modified",
  accessorKey: "modified",
  header: () => <span className="block pl-3.5">Modifié</span>,
  cell: ({ row }) => (
    <span className="num block whitespace-nowrap pl-3.5 t-meta text-muted-foreground">
      {formatDateTime(row.original.modified)}
    </span>
  ),
  size: 128,
};

/** Les 3 tuiles d’en-tête de l’onglet Listes. */
export function pickListStages(lists: RecentPickList[]) {
  const drafts = lists.filter((list) => list.docstatus !== 1);
  const submitted = lists.filter((list) => list.docstatus === 1);
  const remaining = lists.reduce(
    (sum, list) => sum + Math.max(0, (list.requested_qty ?? 0) - (list.picked_qty ?? 0)),
    0,
  );
  const changed = lists.filter((list) => list.custom_order_changed).length;
  return { drafts: drafts.length, submitted: submitted.length, remaining, changed };
}
