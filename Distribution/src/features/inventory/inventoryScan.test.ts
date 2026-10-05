import { beforeEach, describe, expect, it } from "vitest"
import type { ScanIndex } from "@/shared/api/inventory"
import {
  applyResults,
  deviceTotals,
  lineKey,
  makeJournalEntry,
  pendingEntries,
  readJournal,
  resolveScan,
  trimJournal,
  writeJournal,
  type JournalEntry,
} from "@/features/inventory/inventoryScan"

const index: ScanIndex = {
  warehouses: ["Magasin"],
  items: {
    "ART-1": { item_name: "Eau 1,5 L", stock_uom: "N°", has_batch_no: false, has_expiry_date: false, uoms: { "N°": 1, Carton: 6 } },
    "ART-2": { item_name: "Yaourt", stock_uom: "N°", has_batch_no: true, has_expiry_date: true, uoms: { "N°": 1 } },
  },
  barcodes: {
    "6130000000011": { item_code: "ART-1", uom: null },
    "6130000000028": { item_code: "ART-1", uom: "Carton" },
    "6130000000035": { item_code: "ART-2", uom: null },
  },
}

describe("resolveScan", () => {
  it("resolves a unit barcode", () => {
    const result = resolveScan(index, " 6130000000011 ")
    expect(result.ok && result.scan).toMatchObject({ itemCode: "ART-1", uom: "N°", factor: 1, barcode: "6130000000011" })
  })

  it("applies the pack conversion factor", () => {
    const result = resolveScan(index, "6130000000028")
    expect(result.ok && result.scan).toMatchObject({ itemCode: "ART-1", uom: "Carton", factor: 6 })
  })

  it("accepts an item code typed by hand", () => {
    const result = resolveScan(index, "ART-2")
    expect(result.ok && result.scan).toMatchObject({ itemCode: "ART-2", hasBatch: true, barcode: null })
  })

  it("rejects codes outside the scope", () => {
    const result = resolveScan(index, "999")
    expect(result.ok).toBe(false)
  })

  it("waits for the index", () => {
    expect(resolveScan(undefined, "6130000000011").ok).toBe(false)
  })
})

function entry(overrides: Partial<JournalEntry> = {}): JournalEntry {
  const resolved = resolveScan(index, "6130000000028")
  if (!resolved.ok) throw new Error("scan")
  return { ...makeJournalEntry(resolved.scan, { warehouse: "Magasin", qty: 2, mode: "scan" }), ...overrides }
}

describe("journal", () => {
  beforeEach(() => localStorage.clear())

  it("stores quantities in stock units", () => {
    const created = entry()
    expect(created.stockQty).toBe(12)
    expect(created.state).toBe("pending")
  })

  it("sends only pending entries without display fields", () => {
    const sent = pendingEntries([entry(), entry({ state: "synced" })])
    expect(sent).toHaveLength(1)
    expect(sent[0]).not.toHaveProperty("itemName")
  })

  it("marks results, duplicates count as synced", () => {
    const a = entry()
    const b = entry()
    const c = entry()
    const next = applyResults(
      [a, b, c],
      [
        { client_uuid: a.client_uuid, status: "ok" },
        { client_uuid: b.client_uuid, status: "duplicate" },
        { client_uuid: c.client_uuid, status: "error", message: "Hors périmètre" },
      ],
    )
    expect(next.map((item) => item.state)).toEqual(["synced", "synced", "error"])
    expect(next[2].message).toBe("Hors périmètre")
  })

  it("totals per line ignore undone and rejected entries", () => {
    const totals = deviceTotals([entry(), entry({ state: "undone" }), entry({ state: "error" }), entry({ batch_no: "L1" })])
    expect(totals[lineKey("ART-1", "Magasin")]).toBe(12)
    expect(totals[lineKey("ART-1", "Magasin", "L1")]).toBe(12)
  })

  it("keeps every pending entry when trimming", () => {
    const synced = Array.from({ length: 250 }, () => entry({ state: "synced" }))
    const pending = entry()
    const trimmed = trimJournal([pending, ...synced])
    expect(trimmed).toContain(pending)
    expect(trimmed).toHaveLength(201)
  })

  it("persists per inventory", () => {
    const created = entry()
    writeJournal("INV-1", [created])
    expect(readJournal("INV-1")).toEqual([created])
    expect(readJournal("INV-2")).toEqual([])
  })
})
