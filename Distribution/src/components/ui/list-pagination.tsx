import { useEffect, useMemo, useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"

export const LIST_PAGE_SIZE = 20

export function usePagedList<T>(items: T[], resetKey = "", pageSize = LIST_PAGE_SIZE) {
  const [page, setPage] = useState(1)
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))

  useEffect(() => {
    setPage(1)
  }, [resetKey])

  useEffect(() => {
    if (page > totalPages) setPage(totalPages)
  }, [page, totalPages])

  const current = Math.min(Math.max(1, page), totalPages)
  const start = (current - 1) * pageSize
  const paged = items.slice(start, start + pageSize)

  return {
    page: current,
    setPage,
    paged,
    totalPages,
    pageSize,
    total: items.length,
    from: items.length ? start + 1 : 0,
    to: start + paged.length,
  }
}

function visiblePages(current: number, total: number): Array<number | "gap"> {
  if (total <= 7) return Array.from({ length: total }, (_, index) => index + 1)
  const pages = new Set([1, total, current, current - 1, current + 1])
  const sorted = [...pages].filter((page) => page >= 1 && page <= total).sort((left, right) => left - right)
  const result: Array<number | "gap"> = []
  for (const page of sorted) {
    const last = result[result.length - 1]
    if (typeof last === "number" && page - last > 1) result.push("gap")
    result.push(page)
  }
  return result
}

export function ListPagination({
  page,
  totalPages,
  total,
  from,
  to,
  onPageChange,
}: {
  page: number
  totalPages: number
  total: number
  from: number
  to: number
  onPageChange: (page: number) => void
}) {
  const pages = useMemo(() => visiblePages(page, totalPages), [page, totalPages])
  if (total === 0) return null

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="num t-meta text-muted-foreground">
        {from}–{to} sur {total}
      </p>
      {totalPages > 1 ? (
        <nav aria-label="Pagination" className="flex items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            aria-label="Page précédente"
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft />
            <span className="hidden sm:inline">Précédent</span>
          </Button>
          {pages.map((item, index) =>
            item === "gap" ? (
              <span key={`gap-${index}`} className="px-1.5 text-muted-foreground">
                …
              </span>
            ) : (
              <Button
                key={item}
                type="button"
                variant={item === page ? "outline" : "ghost"}
                size="icon-sm"
                aria-label={`Page ${item}`}
                aria-current={item === page ? "page" : undefined}
                onClick={() => onPageChange(item)}
              >
                {item}
              </Button>
            ),
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={page >= totalPages}
            aria-label="Page suivante"
            onClick={() => onPageChange(page + 1)}
          >
            <span className="hidden sm:inline">Suivant</span>
            <ChevronRight />
          </Button>
        </nav>
      ) : null}
    </div>
  )
}
