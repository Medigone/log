import type { Inventory, ReviewLine } from "@/shared/api/inventory"

export function scopeSummary(inventory: Pick<Inventory, "scope_type" | "warehouses" | "item_groups" | "brands" | "items">) {
  if (inventory.scope_type === "Global" && !inventory.warehouses.length) return "Tout le stock"
  const parts = [
    inventory.warehouses.length ? inventory.warehouses.join(", ") : "Tous les entrepôts",
    inventory.item_groups.length ? `Groupes : ${inventory.item_groups.join(", ")}` : null,
    inventory.brands.length ? `Marques : ${inventory.brands.join(", ")}` : null,
    inventory.items.length ? `${inventory.items.length} article${inventory.items.length > 1 ? "s" : ""}` : null,
  ]
  return parts.filter(Boolean).join(" · ")
}

export function parseItemCodes(value: string) {
  return Array.from(new Set(value.split(/[\s,;]+/).map((code) => code.trim()).filter(Boolean)))
}

export type ReviewFilter = "all" | "variance" | "recount" | "uncounted" | "hors_liste"

export function matchesReviewFilter(line: ReviewLine, filter: ReviewFilter) {
  switch (filter) {
    case "variance":
      return Boolean(line.variance)
    case "recount":
      return line.needs_recount
    case "uncounted":
      return line.counted_qty == null
    case "hors_liste":
      return line.hors_liste
    default:
      return true
  }
}
