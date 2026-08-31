export const CATALOG_SORTS = [
  { value: "relevance", label: "Pertinence" },
  { value: "name_asc", label: "Nom de A à Z" },
  { value: "name_desc", label: "Nom de Z à A" },
  { value: "recent", label: "Articles récemment ajoutés" },
] as const

export type CatalogSort = (typeof CATALOG_SORTS)[number]["value"]

export function parseCatalogSort(value: string | null): CatalogSort {
  return CATALOG_SORTS.some((item) => item.value === value) ? (value as CatalogSort) : "relevance"
}

export function selectString(next: unknown, fallback = ""): string {
  if (typeof next === "object" && next && "value" in next) return String((next as { value: string }).value)
  return String(next ?? fallback)
}

export function catalogCountLabel(total: number | undefined, itemCount: number, hasNext: boolean, page: number) {
  const count = typeof total === "number" ? total : !hasNext && page === 1 ? itemCount : null
  if (count == null) return null
  if (count <= 1) return `${count} article disponible`
  return `${count} articles disponibles`
}

export function offerCount(payload: { banners: Array<{ campaign?: string | null }>; rails: Array<{ kind?: string; campaign?: string | null }> } | null | undefined) {
  if (!payload) return 0
  const campaigns = new Set<string>()
  for (const banner of payload.banners) {
    if (banner.campaign) campaigns.add(banner.campaign)
  }
  for (const rail of payload.rails) {
    if (rail.kind !== "group" && rail.campaign) campaigns.add(rail.campaign)
  }
  if (campaigns.size > 0) return campaigns.size
  return payload.banners.length + payload.rails.filter((rail) => rail.kind !== "group").length
}
