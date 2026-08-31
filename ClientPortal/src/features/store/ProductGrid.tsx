import type { ReactNode } from "react"
import { ProductCard } from "@/features/store/ProductCard"
import { Skeleton } from "@/components/ui/skeleton"
import type { CatalogItem } from "@/shared/types"

const GRID_CLASS =
  "grid w-full min-w-0 grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5"

export function catalogColumnCount(width: number) {
  if (width >= 1280) return 5
  if (width >= 1024) return 4
  if (width >= 640) return 3
  return 2
}

export function ProductGrid({
  items,
  insert,
  insertAfter,
  children,
}: {
  items: CatalogItem[]
  insert?: ReactNode
  insertAfter?: number
  children?: ReactNode
}) {
  if (!insert) {
    return (
      <div className={GRID_CLASS}>
        {items.map((item) => (
          <ProductCard key={item.itemCode} item={item} />
        ))}
        {children}
      </div>
    )
  }

  const split = Math.max(0, insertAfter ?? 0)
  const head = items.slice(0, split)
  const tail = items.slice(split)

  return (
    <div className="flex flex-col gap-4">
      {head.length > 0 ? (
        <div className={GRID_CLASS}>
          {head.map((item) => (
            <ProductCard key={item.itemCode} item={item} />
          ))}
        </div>
      ) : null}
      {insert}
      {tail.length > 0 ? (
        <div className={GRID_CLASS}>
          {tail.map((item) => (
            <ProductCard key={item.itemCode} item={item} />
          ))}
        </div>
      ) : null}
      {children}
    </div>
  )
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className={GRID_CLASS} aria-hidden>
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="flex flex-col gap-2 rounded-xl border p-2">
          <Skeleton className="aspect-[4/3] w-full rounded-lg" />
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </div>
      ))}
    </div>
  )
}
