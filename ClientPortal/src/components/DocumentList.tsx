import type { ReactNode } from "react"
import { Link, useLocation, useNavigate } from "react-router-dom"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronRight } from "lucide-react"
import { RecordList } from "@/components/RecordList"
import { StatusBadge } from "@/components/StatusBadge"
import { Button } from "@/components/ui/button"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { cn } from "@/lib/utils"
import { listSearchState } from "@/shared/listNavigation"

export type DocumentListSortDir = "asc" | "desc"

export interface DocumentListColumn<T> {
  header: string
  className?: string
  sortKey?: string
  cell: (item: T) => ReactNode
}

export interface DocumentListSort {
  field: string
  dir: DocumentListSortDir
}

function isInteractiveTarget(target: EventTarget | null) {
  return Boolean((target as HTMLElement | null)?.closest?.("a, button, input, textarea, select, [role='button']"))
}

function nextSortDir(active: boolean, currentDir: DocumentListSortDir): DocumentListSortDir {
  if (!active) return "desc"
  return currentDir === "desc" ? "asc" : "desc"
}

function ColumnHeader({
  header,
  className,
  sortKey,
  sort,
  onSort,
}: {
  header: string
  className?: string
  sortKey?: string
  sort?: DocumentListSort
  onSort?: (field: string, dir: DocumentListSortDir) => void
}) {
  if (!sortKey || !onSort) {
    return header
  }

  const active = sort?.field === sortKey
  const dir = active ? sort.dir : undefined
  const Icon = dir === "asc" ? ArrowUp : dir === "desc" ? ArrowDown : ArrowUpDown
  const alignRight = className?.includes("text-right")

  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn("-ml-2", alignRight && "w-full justify-end -mr-2 ml-0")}
      onClick={() => onSort(sortKey, nextSortDir(active, sort?.dir ?? "desc"))}
      aria-label={`Trier par ${header}`}
    >
      {header}
      <Icon data-icon="inline-end" />
    </Button>
  )
}

export function DocumentList<T>({
  items,
  getKey,
  href,
  title,
  meta,
  status,
  amount,
  dimmed,
  columns,
  sort,
  onSort,
}: {
  items: T[]
  getKey: (item: T) => string
  href?: (item: T) => string
  title: (item: T) => ReactNode
  meta?: (item: T) => ReactNode
  status: (item: T) => string | null | undefined
  amount?: (item: T) => ReactNode
  dimmed?: (item: T) => boolean
  columns: DocumentListColumn<T>[]
  sort?: DocumentListSort
  onSort?: (field: string, dir: DocumentListSortDir) => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const navState = listSearchState(location.search)

  const open = (to: string) => {
    navigate(to, { state: navState })
  }

  return (
    <RecordList
      items={
        <ItemGroup>
          {items.map((item) => {
            const to = href?.(item)
            const key = getKey(item)
            return (
              <Item
                key={key}
                variant="outline"
                className={cn(dimmed?.(item) && "opacity-60")}
                render={to ? <Link to={to} state={navState} aria-label={`Consulter ${key}`} /> : undefined}
              >
                <ItemContent>
                  <ItemTitle>{title(item)}</ItemTitle>
                  {meta ? <ItemDescription>{meta(item)}</ItemDescription> : null}
                </ItemContent>
                <ItemActions>
                  {amount ? <span className="text-sm font-medium">{amount(item)}</span> : null}
                  <StatusBadge status={status(item)} />
                  {to ? <ChevronRight /> : null}
                </ItemActions>
              </Item>
            )
          })}
        </ItemGroup>
      }
      table={
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => {
                  const active = Boolean(column.sortKey && sort?.field === column.sortKey)
                  return (
                    <TableHead
                      key={column.header}
                      className={column.className}
                      aria-sort={
                        column.sortKey
                          ? active
                            ? sort?.dir === "asc"
                              ? "ascending"
                              : "descending"
                            : "none"
                          : undefined
                      }
                    >
                      <ColumnHeader
                        header={column.header}
                        className={column.className}
                        sortKey={column.sortKey}
                        sort={sort}
                        onSort={onSort}
                      />
                    </TableHead>
                  )
                })}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => {
                const to = href?.(item)
                const key = getKey(item)
                return (
                  <TableRow
                    key={key}
                    className={cn(to && "cursor-pointer", dimmed?.(item) && "opacity-60")}
                    tabIndex={to ? 0 : undefined}
                    role={to ? "link" : undefined}
                    aria-label={to ? `Consulter ${key}` : undefined}
                    onClick={
                      to
                        ? (event) => {
                            if (isInteractiveTarget(event.target)) return
                            open(to)
                          }
                        : undefined
                    }
                    onKeyDown={
                      to
                        ? (event) => {
                            if (event.key !== "Enter" && event.key !== " ") return
                            event.preventDefault()
                            open(to)
                          }
                        : undefined
                    }
                  >
                    {columns.map((column) => (
                      <TableCell key={column.header} className={column.className}>
                        {column.cell(item)}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      }
    />
  )
}
