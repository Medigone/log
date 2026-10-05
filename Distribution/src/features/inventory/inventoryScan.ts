import { normalizeScannedBarcode } from "@/features/barcodes/itemBarcodeScan"
import type { CountEntryInput, CountEntryResult, ScanIndex } from "@/shared/api/inventory"

/** Article reconnu par l'index local : aucun appel réseau pendant le scan. */
export interface ResolvedScan {
  itemCode: string
  itemName: string
  barcode: string | null
  uom: string
  stockUom: string
  /** Unités de stock par unité scannée (carton = 12, etc.). */
  factor: number
  hasBatch: boolean
  hasExpiry: boolean
}

export type ScanResolution = { ok: true; scan: ResolvedScan } | { ok: false; message: string }

export function resolveScan(index: ScanIndex | undefined, raw: string): ScanResolution {
  const code = normalizeScannedBarcode(raw)
  if (!code) return { ok: false, message: "Scannez un code-barres." }
  if (!index) return { ok: false, message: "Index des articles en cours de chargement…" }
  const byBarcode = index.barcodes[code]
  const itemCode = byBarcode?.item_code ?? (index.items[code] ? code : null)
  if (!itemCode) return { ok: false, message: `Code inconnu ou hors périmètre : ${code}` }
  const item = index.items[itemCode]
  if (!item) return { ok: false, message: `Article ${itemCode} hors du périmètre de l’inventaire.` }
  const uom = byBarcode?.uom || item.stock_uom
  const factor = item.uoms[uom] ?? 1
  return {
    ok: true,
    scan: {
      itemCode,
      itemName: item.item_name,
      barcode: byBarcode ? code : null,
      uom,
      stockUom: item.stock_uom,
      factor: factor > 0 ? factor : 1,
      hasBatch: item.has_batch_no,
      hasExpiry: item.has_expiry_date,
    },
  }
}

export function newClientUuid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export type JournalState = "pending" | "synced" | "error" | "undone"

/** Saisie gardée sur l'appareil : affichée tout de suite, envoyée par lot. */
export interface JournalEntry extends CountEntryInput {
  itemName: string
  stockUom: string
  /** Quantité en unité de stock (qty × facteur). */
  stockQty: number
  createdAt: string
  state: JournalState
  message?: string
}

export function makeJournalEntry(
  scan: ResolvedScan,
  input: { warehouse: string; qty: number; batchNo?: string | null; expiryDate?: string | null; mode: "scan" | "manuel" },
  now = new Date(),
): JournalEntry {
  return {
    client_uuid: newClientUuid(),
    item_code: scan.itemCode,
    warehouse: input.warehouse,
    batch_no: input.batchNo || null,
    expiry_date: input.expiryDate || null,
    qty: input.qty,
    uom: scan.uom,
    barcode: scan.barcode,
    mode: input.mode,
    itemName: scan.itemName,
    stockUom: scan.stockUom,
    stockQty: input.qty * scan.factor,
    createdAt: now.toISOString(),
    state: "pending",
  }
}

export function pendingEntries(journal: JournalEntry[]): CountEntryInput[] {
  return journal
    .filter((entry) => entry.state === "pending")
    .map((entry) => ({
      client_uuid: entry.client_uuid,
      item_code: entry.item_code,
      warehouse: entry.warehouse,
      batch_no: entry.batch_no,
      expiry_date: entry.expiry_date,
      qty: entry.qty,
      uom: entry.uom,
      barcode: entry.barcode,
      mode: entry.mode,
    }))
}

/** Les doublons (déjà reçus par le serveur) comptent comme envoyés. */
export function applyResults(journal: JournalEntry[], results: CountEntryResult[]): JournalEntry[] {
  const byUuid = new Map(results.map((result) => [result.client_uuid, result]))
  return journal.map((entry) => {
    const result = byUuid.get(entry.client_uuid)
    if (!result || entry.state !== "pending") return entry
    if (result.status === "error") return { ...entry, state: "error", message: result.message }
    return { ...entry, state: "synced", message: undefined }
  })
}

export function lineKey(itemCode: string, warehouse: string, batchNo?: string | null) {
  return `${itemCode}::${warehouse}::${batchNo || ""}`
}

/** Total compté sur cet appareil par ligne (hors saisies annulées ou rejetées). */
export function deviceTotals(journal: JournalEntry[]): Record<string, number> {
  const totals: Record<string, number> = {}
  for (const entry of journal) {
    if (entry.state === "undone" || entry.state === "error") continue
    const key = lineKey(entry.item_code, entry.warehouse, entry.batch_no)
    totals[key] = (totals[key] ?? 0) + entry.stockQty
  }
  return totals
}

const MAX_SYNCED_KEPT = 200

/** Garde toutes les saisies non envoyées et seulement les dernières déjà envoyées. */
export function trimJournal(journal: JournalEntry[]): JournalEntry[] {
  let synced = 0
  const kept: JournalEntry[] = []
  for (let index = journal.length - 1; index >= 0; index -= 1) {
    const entry = journal[index]
    if (entry.state === "pending" || entry.state === "error") {
      kept.push(entry)
    } else if (synced < MAX_SYNCED_KEPT) {
      kept.push(entry)
      synced += 1
    }
  }
  return kept.reverse()
}

const STORAGE_PREFIX = "intrapro-distribution.inventory-journal.v1."

export function readJournal(inventory: string): JournalEntry[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_PREFIX + inventory) || "[]")
    return Array.isArray(value) ? value.filter(isJournalEntry) : []
  } catch {
    return []
  }
}

export function writeJournal(inventory: string, journal: JournalEntry[]) {
  try {
    localStorage.setItem(STORAGE_PREFIX + inventory, JSON.stringify(trimJournal(journal)))
  } catch {
    // Stockage plein ou indisponible : la file reste en mémoire pour cette session.
  }
}

function isJournalEntry(value: unknown): value is JournalEntry {
  if (!value || typeof value !== "object") return false
  const entry = value as Partial<JournalEntry>
  return typeof entry.client_uuid === "string" && typeof entry.item_code === "string" && typeof entry.qty === "number"
}
