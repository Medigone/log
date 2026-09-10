import { describe, expect, it } from "vitest"
import { decideScanAction, normalizeScannedBarcode } from "@/features/barcodes/itemBarcodeScan"
import type { ItemBarcodeItem } from "@/features/barcodes/itemBarcodeScan"

const item = (itemCode: string): ItemBarcodeItem => ({
  itemCode,
  itemName: itemCode,
  stockUom: "Unité",
  barcodes: [],
  uoms: [{ uom: "Unité", conversionFactor: 1 }],
})

describe("itemBarcodeScan", () => {
  it("normalise les espaces", () => {
    expect(normalizeScannedBarcode("  123  ")).toBe("123")
  })

  it("ouvre l’article déjà lié si aucun n’est sélectionné", () => {
    expect(decideScanAction("123", item("ART-1"), null)).toEqual({ action: "open-item", item: item("ART-1") })
  })

  it("signale un code déjà associé à l’article sélectionné", () => {
    expect(decideScanAction("123", item("ART-1"), "ART-1")).toEqual({ action: "already", item: item("ART-1") })
  })

  it("refuse un code déjà lié à un autre article", () => {
    expect(decideScanAction("123", item("ART-2"), "ART-1")).toEqual({
      action: "conflict",
      barcode: "123",
      item: item("ART-2"),
    })
  })

  it("ajoute le code à l’article sélectionné s’il est libre", () => {
    expect(decideScanAction("999", null, "ART-1")).toEqual({ action: "add", itemCode: "ART-1", barcode: "999" })
  })

  it("garde le code en attente si aucun article n’est choisi", () => {
    expect(decideScanAction("999", null, null)).toEqual({ action: "pending", barcode: "999" })
  })
})
