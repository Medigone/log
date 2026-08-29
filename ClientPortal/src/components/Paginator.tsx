import type { MouseEvent } from "react"
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination"

export function Paginator({ page, hasNext, onChange }: { page: number; hasNext: boolean; onChange: (page: number) => void }) {
  if (page === 1 && !hasNext) return null

  const go = (next: number) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault()
    onChange(next)
  }

  return (
    <Pagination className="pt-4">
      <PaginationContent>
        <PaginationItem>
          <PaginationPrevious
            href="#"
            text="Précédent"
            aria-disabled={page <= 1}
            className={page <= 1 ? "pointer-events-none opacity-50" : undefined}
            onClick={page <= 1 ? (event) => event.preventDefault() : go(page - 1)}
          />
        </PaginationItem>
        <PaginationItem>
          <span className="px-3 text-sm text-muted-foreground">Page {page}</span>
        </PaginationItem>
        <PaginationItem>
          <PaginationNext
            href="#"
            text="Suivant"
            aria-disabled={!hasNext}
            className={!hasNext ? "pointer-events-none opacity-50" : undefined}
            onClick={!hasNext ? (event) => event.preventDefault() : go(page + 1)}
          />
        </PaginationItem>
      </PaginationContent>
    </Pagination>
  )
}
