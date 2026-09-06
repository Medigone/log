import { useEffect, useMemo, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import {
  useTable,
  type Column,
  type ColumnDef,
  type ColumnPinningState,
  type ExpandedState,
  type PaginationState,
  type SortingState,
  type Table,
} from "@tanstack/react-table"
import { Columns3 } from "lucide-react"
import { DataGridPagination12 } from "@/components/examples/c-pagination-12"
import {
  DataGrid,
  DataGridContainer,
  dataGridFeatures,
  type DataGridFeatures,
} from "@/components/reui/data-grid/data-grid"
import { DataGridColumnHeader } from "@/components/reui/data-grid/data-grid-column-header"
import { DataGridColumnVisibility } from "@/components/reui/data-grid/data-grid-column-visibility"
import type { DataGridI18nOverrides } from "@/components/reui/data-grid/data-grid-i18n"
import { DataGridScrollArea } from "@/components/reui/data-grid/data-grid-scroll-area"
import { DataGridTable, DataGridTableRowExpand } from "@/components/reui/data-grid/data-grid-table"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "@/components/ui/status-badge"
import { cn } from "@/lib/utils"
import { formatQuantity } from "@/shared/format"
import type { RecentPickListItem, SalesOrderPickLine } from "@/shared/api/preparation"
import { pickLineState } from "@/shared/api/preparation"
import { usePreparationToolbarEnd } from "@/features/preparation/PreparationQueueShell"

/** Même hauteur de ligne pour Commandes, Listes, Retours et sous-grilles d’articles.
 *  Cibler `[data-row-id]` évite d’écraser la cellule dépliée (colspan) qui contient le sous-tableau. */
const PREPARATION_TABLE_ROWS =
  "[&_thead_tr]:h-8 [&_thead_th]:h-8 [&_thead_th]:py-0 [&_tbody_tr[data-row-id]]:h-10 [&_tbody_tr[data-row-id]>td]:h-10 [&_tbody_tr[data-row-id]>td]:py-0 [&_tbody_tr[data-row-id]>td]:box-border [&_tbody_tr[data-row-id]>td]:overflow-hidden"

const NESTED_TABLE_ROWS = cn(
  PREPARATION_TABLE_ROWS,
  "text-[12.5px] [&_th]:text-[12.5px] [&_th]:font-normal [&_button]:text-[12.5px] [&_button]:font-normal",
  "[&_[data-slot=data-grid-table-resize-handle]]:hidden",
)

export const DATA_GRID_I18N_FR: DataGridI18nOverrides = {
  labels: {
    sortAscending: "Croissant",
    sortDescending: "Décroissant",
    pinColumnStart: "Épingler à gauche",
    pinColumnEnd: "Épingler à droite",
    moveColumnStart: "Déplacer à gauche",
    moveColumnEnd: "Déplacer à droite",
    columnsMenu: "Colonnes",
    unpinColumn: (title) => `Désépingler ${title}`,
    toggleColumns: "Afficher les colonnes",
    rowCreate: "Ajouter une ligne",
    pinRow: "Épingler la ligne",
    unpinRow: "Désépingler la ligne",
    selectRow: "Sélectionner la ligne",
    selectAll: "Tout sélectionner",
    expandRow: "Afficher les articles",
    collapseRow: "Masquer les articles",
    dragToReorder: "Glisser pour réordonner",
    dragToReorderRow: "Glisser pour réordonner la ligne",
    reorderingUnavailable: "Réordonnancement indisponible",
    loading: "Chargement…",
    empty: "Aucun résultat.",
    allRowsLoaded: "Tous les enregistrements sont chargés",
    rowsPerPage: "Lignes par page",
    paginationInfo: ({ from, to, count }) => `${from} – ${to} sur ${count}`,
    previousPage: "Page précédente",
    nextPage: "Page suivante",
    goToPage: (page) => `Aller à la page ${page}`,
    paginationEllipsis: "…",
    filterSelectedCount: (count) => `${count} sélectionné(s)`,
    filterNoResults: "Aucun résultat.",
    filterClear: "Effacer les filtres",
  },
}

export function gridHeader(title: string) {
  return (({ column }: { column: Column<DataGridFeatures, object> }) => (
    <DataGridColumnHeader column={column} title={title} visibility />
  )) as never
}

/** En-tête triable + libellé pour le menu Colonnes (`meta.headerTitle`). */
export function namedHeader(title: string, extra?: { fillWidth?: boolean; autoSize?: boolean }) {
  return {
    header: gridHeader(title),
    meta: { headerTitle: title, ...extra },
  }
}

export function pickLineIsShort(line: Pick<SalesOrderPickLine, "required" | "available">) {
  return pickLineState(line) === "shortage"
}

function pickLineStatus(line: SalesOrderPickLine) {
  const state = pickLineState(line)
  if (state === "shortage") return { label: "Rupture", tone: "danger" as const }
  if (state === "on_list") return { label: "Sur liste", tone: "info" as const }
  if (state === "to_pick") return { label: "À prélever", tone: "warning" as const }
  return { label: "OK", tone: "success" as const }
}

export function ItemIdentity({ code, name }: { code: string; name?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="font-medium">{name || code}</span>
      {name && name !== code ? <span className="text-muted-foreground">{code}</span> : null}
    </div>
  )
}

export function NestedItemsGrid<T extends object>({
  columns,
  rows,
  getRowId,
  empty,
  label,
  className,
}: {
  columns: Array<ColumnDef<DataGridFeatures, T>>
  rows: T[]
  getRowId: (row: T) => string
  empty?: ReactNode
  label: string
  className?: string
}) {
  const pagination = useMemo(
    () => ({ pageIndex: 0, pageSize: Math.max(rows.length, 1) }),
    [rows.length],
  )
  const table = useTable({
    features: dataGridFeatures,
    columns,
    data: rows,
    getRowId,
    enableSorting: false,
    defaultColumn: { enableResizing: false },
    state: { pagination },
  })

  return (
    <div className={cn("block w-full min-w-0", className ?? "bg-muted/50 p-2")} role="region" aria-label={label}>
      <DataGrid
        table={table}
        recordCount={rows.length}
        emptyMessage={empty ?? "Aucun article."}
        i18n={DATA_GRID_I18N_FR}
        tableLayout={{
          dense: true,
          rowBorder: true,
          headerSticky: false,
          width: "fixed",
          columnsResizable: true,
        }}
        tableClassNames={{
          base: NESTED_TABLE_ROWS,
          headerRow: "h-8",
          bodyRow: "h-10",
        }}
      >
        <DataGridContainer className="w-full overflow-hidden rounded-md border bg-background">
          <DataGridTable />
        </DataGridContainer>
      </DataGrid>
    </div>
  )
}

function TruncateCell({ value, muted }: { value?: string | null; muted?: boolean }) {
  return (
    <span
      className={
        muted
          ? "truncate whitespace-nowrap text-[11px] text-muted-foreground"
          : "truncate whitespace-nowrap text-[12.5px] font-medium"
      }
    >
      {value || "—"}
    </span>
  )
}

export function OrderItemsSubGrid({ items }: { items: SalesOrderPickLine[] }) {
  const columns = useMemo<Array<ColumnDef<DataGridFeatures, SalesOrderPickLine>>>(
    () => [
      {
        id: "item",
        accessorFn: (row) => row.item_name || row.item_code,
        ...namedHeader("Article", { fillWidth: true }),
        cell: ({ row }) => <TruncateCell value={row.original.item_name || row.original.item_code} />,
        size: 180,
      },
      {
        id: "code",
        accessorKey: "item_code",
        ...namedHeader("Code"),
        cell: ({ row }) => <TruncateCell value={row.original.item_code} muted />,
        size: 110,
      },
      {
        id: "required",
        accessorKey: "required",
        ...namedHeader("Demandé restant"),
        cell: ({ row }) => (
          <span className="num tabular-nums text-[12.5px]">
            {formatQuantity(row.original.required)}
            {row.original.uom ? ` ${row.original.uom}` : ""}
          </span>
        ),
        size: 140,
      },
      {
        id: "available",
        accessorKey: "available",
        ...namedHeader("Disponible"),
        cell: ({ row }) => <span className="num tabular-nums text-[12.5px]">{formatQuantity(row.original.available)}</span>,
        size: 110,
      },
      {
        id: "warehouse",
        accessorKey: "warehouse",
        ...namedHeader("Entrepôt"),
        cell: ({ row }) => <span className="truncate whitespace-nowrap text-[13px]">{row.original.warehouse || "—"}</span>,
        size: 140,
      },
      {
        id: "status",
        accessorFn: (row) => pickLineState(row),
        ...namedHeader("État"),
        cell: ({ row }) => {
          const status = pickLineStatus(row.original)
          return (
            <StatusBadge tone={status.tone} size="sm">
              {status.label}
            </StatusBadge>
          )
        },
        size: 110,
      },
    ],
    [],
  )

  return (
    <NestedItemsGrid
      columns={columns}
      rows={items}
      getRowId={(row) => `${row.item_code}-${row.warehouse || ""}`}
      empty="Aucune ligne à prélever."
      label="Articles de la commande"
    />
  )
}

export function PickListItemsSubGrid({ items }: { items: RecentPickListItem[] }) {
  const columns = useMemo<Array<ColumnDef<DataGridFeatures, RecentPickListItem>>>(
    () => [
      {
        id: "item",
        accessorFn: (row) => row.item_name || row.item_code,
        ...namedHeader("Article", { fillWidth: true }),
        cell: ({ row }) => <TruncateCell value={row.original.item_name || row.original.item_code} />,
        size: 180,
      },
      {
        id: "code",
        accessorKey: "item_code",
        ...namedHeader("Code"),
        cell: ({ row }) => <TruncateCell value={row.original.item_code} muted />,
        size: 110,
      },
      {
        id: "requested",
        accessorKey: "requested_qty",
        ...namedHeader("Demandé"),
        cell: ({ row }) => (
          <span className="num tabular-nums text-[12.5px]">
            {formatQuantity(row.original.requested_qty)}
            {row.original.uom ? ` ${row.original.uom}` : ""}
          </span>
        ),
        size: 120,
      },
      {
        id: "picked",
        accessorKey: "picked_qty",
        ...namedHeader("Prélevé"),
        cell: ({ row }) => <span className="num tabular-nums text-[12.5px]">{formatQuantity(row.original.picked_qty)}</span>,
        size: 110,
      },
      {
        id: "warehouse",
        accessorKey: "warehouse",
        ...namedHeader("Entrepôt"),
        cell: ({ row }) => <span className="truncate whitespace-nowrap text-[13px]">{row.original.warehouse || "—"}</span>,
        size: 140,
      },
      {
        id: "order",
        accessorKey: "sales_order",
        ...namedHeader("Commande"),
        cell: ({ row }) => (
          <span className="num truncate whitespace-nowrap text-[12.5px] font-medium">{row.original.sales_order || "—"}</span>
        ),
        size: 140,
      },
    ],
    [],
  )

  return (
    <NestedItemsGrid
      columns={columns}
      rows={items}
      getRowId={(row) => `${row.item_code}-${row.warehouse || ""}-${row.sales_order || ""}`}
      empty="Aucun article sur cette liste."
      label="Articles de la liste de prélèvement"
    />
  )
}

export function OrderItemsList({ items }: { items: SalesOrderPickLine[] }) {
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">Aucune ligne à prélever.</p>
  }
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item) => (
        <li key={`${item.item_code}-${item.warehouse || ""}`} className="flex items-start justify-between gap-3 rounded-md border p-2 text-sm">
          <ItemIdentity code={item.item_code} name={item.item_name} />
          <div className="flex shrink-0 flex-col items-end gap-1">
            <span className="num tabular-nums">
              {formatQuantity(item.required)}
              {item.uom ? ` ${item.uom}` : ""}
            </span>
            {(() => {
              const status = pickLineStatus(item)
              return status.label === "OK" ? (
                <span className="text-muted-foreground">{formatQuantity(item.available)} dispo</span>
              ) : (
                <StatusBadge tone={status.tone} size="sm">
                  {status.label}
                </StatusBadge>
              )
            })()}
          </div>
        </li>
      ))}
    </ul>
  )
}

const DEFAULT_PAGE_SIZE = 10

function pinningFor(columns: Array<{ id?: string }>): ColumnPinningState {
  const ids = new Set(columns.map((column) => column.id).filter(Boolean))
  const start = ["expand"]
  if (ids.has("select")) start.push("select")
  return { start, end: [] }
}

function visibilityFor(_columns: Array<{ id?: string }>): Record<string, boolean> {
  return {}
}

function PreparationColumnsMenu<T extends object>({ table }: { table: Table<DataGridFeatures, T> }) {
  const toolbarEnd = usePreparationToolbarEnd()
  const menu = (
    <DataGridColumnVisibility
      table={table}
      trigger={
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-[30px] rounded-lg text-xs"
          aria-label="Colonnes"
        />
      }
    >
      <Columns3 data-icon="inline-start" />
      Colonnes
    </DataGridColumnVisibility>
  )
  if (!toolbarEnd) return null
  return createPortal(menu, toolbarEnd)
}

export function PreparationSubTableGrid<T extends object>({
  columns,
  rows,
  getRowId,
  expandContent,
  canExpand,
  isLoading,
  empty,
  label,
}: {
  columns: Array<ColumnDef<DataGridFeatures, T>>
  rows: T[]
  getRowId: (row: T) => string
  expandContent: (row: T) => ReactNode
  canExpand?: (row: T) => boolean
  isLoading?: boolean
  empty?: ReactNode
  label: string
}) {
  const [expanded, setExpanded] = useState<ExpandedState>({})
  const [sorting, setSorting] = useState<SortingState>([])
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: DEFAULT_PAGE_SIZE,
  })
  const [columnPinning, setColumnPinning] = useState<ColumnPinningState>(() => pinningFor(columns))
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>(() => visibilityFor(columns))
  const rowKey = rows.map(getRowId).join("\0")

  useEffect(() => {
    setPagination((current) => (current.pageIndex === 0 ? current : { ...current, pageIndex: 0 }))
  }, [rowKey])

  const gridColumns = useMemo<Array<ColumnDef<DataGridFeatures, T>>>(
    () => [
      {
        id: "expand",
        header: () => <span className="sr-only">Articles</span>,
        cell: ({ row }) => (
          <div className="flex h-full items-center justify-center">
            <DataGridTableRowExpand row={row} className="ps-0" />
          </div>
        ),
        size: 40,
        enableSorting: false,
        enableHiding: false,
        meta: {
          expandedContent: expandContent,
          headerClassName: "px-0 text-center",
          cellClassName: "px-0 text-center",
        },
      },
      ...columns,
    ],
    [columns, expandContent],
  )

  const table = useTable({
    features: dataGridFeatures,
    columns: gridColumns,
    data: rows,
    getRowId,
    getRowCanExpand: (row) => (canExpand ? canExpand(row.original) : true),
    state: { expanded, sorting, pagination, columnPinning, columnVisibility },
    onExpandedChange: setExpanded,
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onColumnPinningChange: setColumnPinning,
    onColumnVisibilityChange: setColumnVisibility,
  })

  if (!isLoading && !rows.length && empty) {
    return <>{empty}</>
  }

  return (
    <div role="region" aria-label={label}>
      <DataGrid
        table={table}
        recordCount={rows.length}
        isLoading={Boolean(isLoading)}
        i18n={DATA_GRID_I18N_FR}
        tableLayout={{
          dense: true,
          rowBorder: true,
          headerSticky: true,
          width: "fixed",
          columnsPinnable: true,
          columnsVisibility: true,
          columnsResizable: false,
        }}
        tableClassNames={{ base: PREPARATION_TABLE_ROWS, headerRow: "h-8", bodyRow: "h-10" }}
      >
        <PreparationColumnsMenu table={table} />
        <DataGridContainer className="overflow-hidden bg-card">
          <DataGridScrollArea>
            <DataGridTable />
          </DataGridScrollArea>
        </DataGridContainer>
        <DataGridPagination12 />
      </DataGrid>
    </div>
  )
}
