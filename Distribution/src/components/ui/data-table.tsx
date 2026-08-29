import { useMemo, useState, type ReactNode } from "react"
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"
import { TONES, type StatusTone } from "@/shared/design/statusTone"
import { SkeletonRows } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export interface DataTableColumn<T> {
  id: string
  header: ReactNode
  cell: (row: T) => ReactNode
  width?: string
  align?: "left" | "right" | "center"
  sortValue?: (row: T) => string | number
  hideBelow?: "sm" | "md" | "lg" | "xl"
  numeric?: boolean
  className?: string
}

interface DataTableProps<T> {
  columns: Array<DataTableColumn<T>>
  rows: T[]
  rowKey: (row: T) => string
  rowTone?: (row: T) => StatusTone | undefined
  onRowClick?: (row: T) => void
  isRowActive?: (row: T) => boolean
  isLoading?: boolean
  empty?: ReactNode
  label: string
  defaultSort?: { id: string; direction: "asc" | "desc" }
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
      <div className={cn("rounded-xl border bg-card p-3", className)}>
        <SkeletonRows rows={6} />
      </div>
    )
  }

  return (
    <div className={cn("overflow-hidden rounded-xl border bg-card", className)}>
      <div className={cn(maxHeight, "overflow-auto")}>
        <Table aria-label={label}>
          <colgroup>
            {columns.map((column) => (
              <col key={column.id} style={column.width ? { width: column.width } : undefined} />
            ))}
          </colgroup>
          <TableHeader className="sticky top-0 z-10 bg-muted">
            <TableRow className="hover:bg-transparent">
              {columns.map((column) => {
                const sortable = Boolean(column.sortValue)
                const active = sort?.id === column.id
                return (
                  <TableHead
                    key={column.id}
                    aria-sort={active ? (sort!.direction === "asc" ? "ascending" : "descending") : undefined}
                    className={cn(
                      "h-9 whitespace-nowrap bg-muted text-xs font-medium text-muted-foreground",
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
                          "inline-flex items-center gap-1 rounded-md transition-colors hover:text-foreground",
                          active && "text-foreground",
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
                  </TableHead>
                )
              })}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedRows.length === 0 && (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length} className="whitespace-normal">
                  {empty ?? <p className="py-10 text-center text-sm text-muted-foreground">Aucun résultat.</p>}
                </TableCell>
              </TableRow>
            )}
            {sortedRows.map((row) => {
              const tone = rowTone?.(row)
              const active = isRowActive?.(row)
              return (
                <TableRow
                  key={rowKey(row)}
                  data-state={active ? "selected" : undefined}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(onRowClick && "cursor-pointer", active && "bg-muted")}
                >
                  {columns.map((column, index) => (
                    <TableCell
                      key={column.id}
                      className={cn(
                        "h-10",
                        ALIGN_CLASS[column.align ?? "left"],
                        column.numeric && "num tabular-nums",
                        column.hideBelow && HIDE_CLASS[column.hideBelow],
                        index === 0 && tone && TONES[tone].railInset,
                        column.className,
                      )}
                    >
                      {column.cell(row)}
                    </TableCell>
                  ))}
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
