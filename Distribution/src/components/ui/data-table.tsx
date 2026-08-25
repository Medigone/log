import { useMemo, useState, type ReactNode } from "react"
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { TONES, type StatusTone } from "@/shared/design/statusTone"
import { SkeletonRows } from "@/components/ui/skeleton"

export interface DataTableColumn<T> {
  id: string
  header: ReactNode
  cell: (row: T) => ReactNode
  /** Largeur de colonne (`140px`, `minmax(0,1fr)`, `20%`…). */
  width?: string
  align?: "left" | "right" | "center"
  /** Rend la colonne triable en fournissant la valeur de comparaison. */
  sortValue?: (row: T) => string | number
  /** Masque la colonne sous ce point de rupture. */
  hideBelow?: "sm" | "md" | "lg" | "xl"
  /** Applique l'alignement des chiffres tabulaires. */
  numeric?: boolean
  className?: string
}

interface DataTableProps<T> {
  columns: Array<DataTableColumn<T>>
  rows: T[]
  rowKey: (row: T) => string
  /** Colore le rail de statut à gauche de la ligne — le statut se lit avant l'identité. */
  rowTone?: (row: T) => StatusTone | undefined
  onRowClick?: (row: T) => void
  isRowActive?: (row: T) => boolean
  isLoading?: boolean
  empty?: ReactNode
  /** Libellé accessible du tableau. */
  label: string
  defaultSort?: { id: string; direction: "asc" | "desc" }
  /** Active l'en-tête collant en bornant la hauteur (`max-h-[60vh]`…). */
  maxHeight?: string
  className?: string
}

const HIDE_CLASS = {
  sm: "hidden sm:table-cell",
  md: "hidden md:table-cell",
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
} as const

const ALIGN_CLASS = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
} as const

/**
 * Tableau dense de la console : ligne de 40px, en-tête collant, tri,
 * rail de statut coloré, états de chargement et vide intégrés.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  rowTone,
  onRowClick,
  isRowActive,
  isLoading,
  empty,
  label,
  defaultSort,
  maxHeight,
  className,
}: DataTableProps<T>) {
  const [sort, setSort] = useState(defaultSort)

  const sortedRows = useMemo(() => {
    if (!sort) return rows
    const column = columns.find((item) => item.id === sort.id)
    if (!column?.sortValue) return rows
    const factor = sort.direction === "asc" ? 1 : -1
    return [...rows].sort((a, b) => {
      const left = column.sortValue!(a)
      const right = column.sortValue!(b)
      if (typeof left === "number" && typeof right === "number") return (left - right) * factor
      return String(left).localeCompare(String(right), "fr") * factor
    })
  }, [rows, sort, columns])

  const toggleSort = (id: string) => {
    setSort((current) =>
      current?.id === id
        ? { id, direction: current.direction === "asc" ? "desc" : "asc" }
        : { id, direction: "asc" },
    )
  }

  if (isLoading) {
    return (
      <div className={cn("rounded-lg border border-hairline bg-card p-3 shadow-card", className)}>
        <SkeletonRows rows={6} />
      </div>
    )
  }

  return (
    <div
      className={cn("overflow-hidden rounded-lg border border-hairline bg-card shadow-card", className)}
    >
      <div className={cn("overflow-auto", maxHeight)}>
        <table className="w-full border-separate border-spacing-0" aria-label={label}>
          <colgroup>
            {columns.map((column) => (
              <col key={column.id} style={column.width ? { width: column.width } : undefined} />
            ))}
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr>
              {columns.map((column) => {
                const sortable = Boolean(column.sortValue)
                const active = sort?.id === column.id
                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={active ? (sort!.direction === "asc" ? "ascending" : "descending") : undefined}
                    className={cn(
                      "t-micro whitespace-nowrap border-b border-hairline bg-surface-subtle px-3 py-2 text-muted-foreground",
                      ALIGN_CLASS[column.align ?? "left"],
                      column.hideBelow && HIDE_CLASS[column.hideBelow],
                      column.className,
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column.id)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded transition-colors hover:text-foreground",
                          active && "text-brand-700",
                          column.align === "right" && "flex-row-reverse",
                        )}
                      >
                        {column.header}
                        {active ? (
                          sort!.direction === "asc" ? (
                            <ChevronUp className="size-3" aria-hidden="true" />
                          ) : (
                            <ChevronDown className="size-3" aria-hidden="true" />
                          )
                        ) : (
                          <ChevronsUpDown className="size-3 opacity-40" aria-hidden="true" />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3">
                  {empty ?? <p className="py-10 text-center t-body text-muted-foreground">Aucun résultat.</p>}
                </td>
              </tr>
            )}
            {sortedRows.map((row) => {
              const tone = rowTone?.(row)
              const active = isRowActive?.(row)
              return (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "transition-colors",
                    onRowClick && "cursor-pointer",
                    active ? "bg-brand-50" : "hover:bg-surface-subtle",
                  )}
                >
                  {columns.map((column, index) => (
                    <td
                      key={column.id}
                      className={cn(
                        "h-10 border-b border-hairline px-3 text-sm text-foreground",
                        ALIGN_CLASS[column.align ?? "left"],
                        column.numeric && "num tabular-nums",
                        column.hideBelow && HIDE_CLASS[column.hideBelow],
                        index === 0 && tone && TONES[tone].railInset,
                        column.className,
                      )}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
