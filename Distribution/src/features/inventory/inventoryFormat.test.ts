import { describe, expect, it } from "vitest"
import { matchesReviewFilter, parseItemCodes, scopeSummary } from "@/features/inventory/inventoryFormat"
import type { ReviewLine } from "@/shared/api/inventory"

describe("inventoryFormat", () => {
  it("summarises the scope", () => {
    expect(scopeSummary({ scope_type: "Global", warehouses: [], item_groups: [], brands: [], items: [] })).toBe("Tout le stock")
    expect(scopeSummary({ scope_type: "Partiel", warehouses: ["Magasin"], item_groups: ["Boissons"], brands: [], items: ["A", "B"] })).toBe(
      "Magasin · Groupes : Boissons · 2 articles",
    )
  })

  it("parses item codes without duplicates", () => {
    expect(parseItemCodes("A, B\nC;A  ")).toEqual(["A", "B", "C"])
  })

  it("filters review lines", () => {
    const line = { variance: -2, needs_recount: true, counted_qty: 3, hors_liste: false } as ReviewLine
    const uncounted = { variance: null, needs_recount: false, counted_qty: null, hors_liste: true } as ReviewLine
    expect(matchesReviewFilter(line, "variance")).toBe(true)
    expect(matchesReviewFilter(uncounted, "variance")).toBe(false)
    expect(matchesReviewFilter(uncounted, "uncounted")).toBe(true)
    expect(matchesReviewFilter(uncounted, "hors_liste")).toBe(true)
    expect(matchesReviewFilter(line, "recount")).toBe(true)
  })
})
