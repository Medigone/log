import { CATALOG_SORTS, catalogCountLabel, selectString, type CatalogSort } from "@/features/store/catalogQuery"
import { CatalogFilters } from "@/features/store/CatalogFilters"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger } from "@/components/ui/select"

export function CatalogToolbar({
  total,
  itemCount,
  hasNext,
  page,
  loading,
  groups,
  group,
  sort,
  offersOnly,
  hasOffers,
  onSortChange,
  onGroupChange,
  onOffersChange,
  onResetFilters,
}: {
  total?: number
  itemCount: number
  hasNext: boolean
  page: number
  loading: boolean
  groups: string[]
  group: string
  sort: CatalogSort
  offersOnly: boolean
  hasOffers: boolean
  onSortChange: (sort: CatalogSort) => void
  onGroupChange: (group: string) => void
  onOffersChange: (offersOnly: boolean) => void
  onResetFilters: () => void
}) {
  const countLabel = catalogCountLabel(total, itemCount, hasNext, page)
  const sortLabel = CATALOG_SORTS.find((item) => item.value === sort)?.label ?? "Pertinence"
  const activeCount = (group ? 1 : 0) + (offersOnly ? 1 : 0)

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        {loading && !countLabel ? <Skeleton className="h-4 w-40" /> : countLabel ? (
          <p className="text-sm text-muted-foreground">{countLabel}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Select
          value={sort}
          onValueChange={(next) => onSortChange(selectString(next, "relevance") as CatalogSort)}
          items={[...CATALOG_SORTS]}
        >
          <SelectTrigger className="bg-background" aria-label="Trier le catalogue">
            <span className="text-muted-foreground">Trier :</span> {sortLabel}
          </SelectTrigger>
          <SelectContent align="end">
            <SelectGroup>
              {CATALOG_SORTS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <CatalogFilters
          groups={groups}
          group={group}
          offersOnly={offersOnly}
          hasOffers={hasOffers}
          activeCount={activeCount}
          onGroupChange={onGroupChange}
          onOffersChange={onOffersChange}
          onReset={onResetFilters}
        />
      </div>
    </div>
  )
}
