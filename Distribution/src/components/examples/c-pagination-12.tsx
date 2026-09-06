import { ChevronFirstIcon, ChevronLeftIcon, ChevronRightIcon, ChevronLastIcon } from "lucide-react"
import { useDataGrid } from "@/components/reui/data-grid/data-grid"
import { Button } from "@/components/ui/button"
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

const PAGE_SIZES = [10, 25, 50, 100]

export function Pagination12({
  pageIndex,
  pageSize,
  pageCount,
  recordCount,
  sizes = PAGE_SIZES,
  onPageIndexChange,
  onPageSizeChange,
  rowsPerPageLabel = "Lignes par page",
  firstPageLabel = "Première page",
  previousPageLabel = "Page précédente",
  nextPageLabel = "Page suivante",
  lastPageLabel = "Dernière page",
  paginationInfo,
  className,
}: {
  pageIndex: number
  pageSize: number
  pageCount: number
  recordCount: number
  sizes?: number[]
  onPageIndexChange: (pageIndex: number) => void
  onPageSizeChange: (pageSize: number) => void
  rowsPerPageLabel?: string
  firstPageLabel?: string
  previousPageLabel?: string
  nextPageLabel?: string
  lastPageLabel?: string
  paginationInfo?: string
  className?: string
}) {
  const from = recordCount === 0 ? 0 : pageIndex * pageSize + 1
  const to = Math.min((pageIndex + 1) * pageSize, recordCount)
  const canPrevious = pageIndex > 0
  const canNext = pageIndex + 1 < Math.max(pageCount, 1)
  const rangeLabel = paginationInfo ?? `${from} – ${to} sur ${recordCount}`

  return (
    <nav
      data-slot="data-grid-pagination"
      aria-label="pagination"
      className={cn(
        "flex items-center justify-between gap-x-3 border-t px-3 py-1.5",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="text-muted-foreground shrink-0 text-xs leading-none whitespace-nowrap">
          {rowsPerPageLabel}
        </span>
        <div className="w-16 shrink-0">
          <NativeSelect
            size="sm"
            aria-label={rowsPerPageLabel}
            className="h-7 w-16 px-2 pr-7 text-xs leading-none"
            value={`${pageSize}`}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {sizes.map((size) => (
              <NativeSelectOption key={size} value={`${size}`}>
                {size}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-muted-foreground shrink-0 text-xs leading-none whitespace-nowrap">
          {rangeLabel}
        </span>
        <div className="flex shrink-0 items-center gap-0.5">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={firstPageLabel}
            disabled={!canPrevious}
            onClick={() => onPageIndexChange(0)}
          >
            <ChevronFirstIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={previousPageLabel}
            disabled={!canPrevious}
            onClick={() => onPageIndexChange(pageIndex - 1)}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={nextPageLabel}
            disabled={!canNext}
            onClick={() => onPageIndexChange(pageIndex + 1)}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={lastPageLabel}
            disabled={!canNext}
            onClick={() => onPageIndexChange(Math.max(pageCount - 1, 0))}
          >
            <ChevronLastIcon className="size-4" />
          </Button>
        </div>
      </div>
    </nav>
  )
}

export function DataGridPagination12() {
  const { i18n, table, recordCount, isLoading } = useDataGrid()
  const pageIndex = table.state.pagination.pageIndex
  const pageSize = table.state.pagination.pageSize
  const pageCount = table.getPageCount()
  const from = recordCount === 0 ? 0 : pageIndex * pageSize + 1
  const to = Math.min((pageIndex + 1) * pageSize, recordCount)

  if (isLoading) {
    return (
      <div data-slot="data-grid-pagination" className="flex items-center justify-between gap-2 border-t px-3 py-1.5">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-7 w-60" />
      </div>
    )
  }

  return (
    <Pagination12
      pageIndex={pageIndex}
      pageSize={pageSize}
      pageCount={pageCount}
      recordCount={recordCount}
      onPageIndexChange={(index) => table.setPageIndex(index)}
      onPageSizeChange={(size) => table.setPageSize(size)}
      rowsPerPageLabel={i18n.labels.rowsPerPage}
      previousPageLabel={i18n.labels.previousPage}
      nextPageLabel={i18n.labels.nextPage}
      paginationInfo={i18n.labels.paginationInfo({ from, to, count: recordCount })}
    />
  )
}

export function Pattern() {
  return (
    <Pagination12
      pageIndex={0}
      pageSize={25}
      pageCount={4}
      recordCount={100}
      onPageIndexChange={() => undefined}
      onPageSizeChange={() => undefined}
      rowsPerPageLabel="Rows per page"
      firstPageLabel="Go to first page"
      previousPageLabel="Go to previous page"
      nextPageLabel="Go to next page"
      lastPageLabel="Go to last page"
      paginationInfo="1-25 of 100"
    />
  )
}
