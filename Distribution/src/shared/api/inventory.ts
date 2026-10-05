import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk"
import { apiErrorMessage } from "@/shared/api/distribution"

interface FrappeMessage<T> {
  message: T
}

export { apiErrorMessage }

const METHOD = "log.inventory_ops"

export type InventoryStatus = "Brouillon" | "En cours" | "En revue" | "En validation" | "Validé" | "Annulé"
export type InventoryLineStatus = "À compter" | "Compté" | "À recompter"

export interface InventoryProgress {
  total: number
  counted: number
  to_count: number
  to_recount: number
  percent: number
}

export interface Inventory {
  name: string
  titre: string
  company: string
  status: InventoryStatus
  scope_type: "Global" | "Partiel"
  blind: boolean
  include_zero_stock: boolean
  recount_threshold_qty: number
  recount_threshold_pct: number
  warehouses: string[]
  item_groups: string[]
  brands: string[]
  items: string[]
  opened_by: string | null
  opened_at: string | null
  validated_by: string | null
  validated_at: string | null
  stock_reconciliation: string | null
  notes: string | null
  owner: string
  creation: string | null
  can_validate: boolean
  progress?: InventoryProgress
}

export interface ItemGroupNode {
  name: string
  parent: string | null
  is_group: boolean
  item_count: number
}

export interface InventoryOptions {
  company: string | null
  warehouses: string[]
  item_groups: ItemGroupNode[]
  brands: string[]
  can_validate: boolean
}

export interface InventoryScopeInput {
  company?: string | null
  warehouses: string[]
  item_groups: string[]
  brands: string[]
  items: string[]
}

export interface NewInventoryInput extends InventoryScopeInput {
  titre: string
  blind: boolean
  include_zero_stock: boolean
  recount_threshold_qty: number
  recount_threshold_pct: number
  notes?: string
}

export interface ScopePreview {
  warehouses: number
  items: number
  items_in_stock: number
  stock_lines: number
  batch_items: number
}

export interface ScanIndexItem {
  item_name: string
  stock_uom: string
  has_batch_no: boolean
  has_expiry_date: boolean
  uoms: Record<string, number>
}

export interface ScanIndex {
  warehouses: string[]
  items: Record<string, ScanIndexItem>
  barcodes: Record<string, { item_code: string; uom: string | null }>
}

export interface CountSheetLine {
  name: string
  item_code: string
  item_name: string
  warehouse: string
  batch_no: string | null
  expiry_date: string | null
  stock_uom: string
  status: InventoryLineStatus
  hors_liste: boolean
  round: number
  counted_qty: number
  last_counted_at: string | null
  last_counted_by: string | null
  snapshot_qty?: number
  expected_at_count?: number
}

export interface BatchOption {
  batch_no: string
  expiry_date: string | null
}

export interface CountEntryInput {
  client_uuid: string
  item_code: string
  warehouse: string
  batch_no?: string | null
  expiry_date?: string | null
  qty: number
  uom?: string | null
  barcode?: string | null
  mode: "scan" | "manuel"
}

export interface CountEntryResult {
  client_uuid: string
  status: "ok" | "duplicate" | "error"
  line?: string
  counted_qty?: number
  message?: string
}

export interface ReviewLine {
  name: string
  item_code: string
  item_name: string
  warehouse: string
  batch_no: string | null
  expiry_date: string | null
  stock_uom: string
  status: InventoryLineStatus
  hors_liste: boolean
  round: number
  snapshot_qty: number
  expected_qty: number
  counted_qty: number | null
  first_count_qty: number | null
  variance: number | null
  variance_value: number | null
  valuation_rate: number
  needs_recount: boolean
  last_counted_by: string | null
  last_counted_at: string | null
}

export interface InventoryReview {
  inventory: Inventory
  lines: ReviewLine[]
  totals: {
    lines: number
    counted: number
    uncounted: number
    with_variance: number
    to_recount: number
    variance_value: number
    uncounted_value: number
  }
}

export interface ValidationResult {
  queued: boolean
  stock_reconciliation?: string | null
  inventory: Inventory
}

export const INVENTORY_STATUS_LABELS: Record<InventoryStatus, string> = {
  Brouillon: "Brouillon",
  "En cours": "Comptage en cours",
  "En revue": "En revue",
  "En validation": "Validation en cours",
  Validé: "Validé",
  Annulé: "Annulé",
}

export function useInventoryOptions() {
  return useFrappeGetCall<FrappeMessage<InventoryOptions>>(`${METHOD}.get_inventory_options`, undefined, "inventory-options")
}

export function useInventories(status?: InventoryStatus | null, enabled = true) {
  return useFrappeGetCall<FrappeMessage<Inventory[]>>(
    `${METHOD}.list_inventories`,
    status ? { status } : undefined,
    enabled ? `inventories-${status || "all"}` : null,
  )
}

export function useInventory(name: string | undefined) {
  return useFrappeGetCall<FrappeMessage<Inventory>>(
    `${METHOD}.get_inventory`,
    { name },
    name ? `inventory-${name}` : null,
  )
}

export function useScanIndex(name: string | undefined) {
  return useFrappeGetCall<FrappeMessage<ScanIndex>>(
    `${METHOD}.get_scan_index`,
    { name },
    name ? `inventory-scan-index-${name}` : null,
    { revalidateOnFocus: false, revalidateIfStale: false },
  )
}

export function useCountSheet(name: string | undefined, warehouse: string) {
  return useFrappeGetCall<FrappeMessage<CountSheetLine[]>>(
    `${METHOD}.get_count_sheet`,
    { name, warehouse: warehouse || undefined },
    name ? `inventory-sheet-${name}-${warehouse}` : null,
  )
}

export function useInventoryReview(name: string | undefined, enabled: boolean) {
  return useFrappeGetCall<FrappeMessage<InventoryReview>>(
    `${METHOD}.get_review`,
    { name },
    name && enabled ? `inventory-review-${name}` : null,
  )
}

export function useInventoryMutations() {
  const preview = useFrappePostCall<FrappeMessage<ScopePreview>>(`${METHOD}.preview_scope`)
  const create = useFrappePostCall<FrappeMessage<Inventory>>(`${METHOD}.create_inventory`)
  const start = useFrappePostCall<FrappeMessage<Inventory>>(`${METHOD}.start_inventory`)
  const record = useFrappePostCall<FrappeMessage<CountEntryResult[]>>(`${METHOD}.record_counts`)
  const undo = useFrappePostCall<FrappeMessage<{ status: string; line?: string }>>(`${METHOD}.undo_count`)
  const batches = useFrappePostCall<FrappeMessage<BatchOption[]>>(`${METHOD}.item_batches`)
  const recount = useFrappePostCall<FrappeMessage<{ recount: number; inventory: Inventory }>>(`${METHOD}.request_recount`)
  const finish = useFrappePostCall<FrappeMessage<Inventory>>(`${METHOD}.finish_counting`)
  const reopen = useFrappePostCall<FrappeMessage<Inventory>>(`${METHOD}.reopen_counting`)
  const validate = useFrappePostCall<FrappeMessage<ValidationResult>>(`${METHOD}.validate_inventory`)
  const cancel = useFrappePostCall<FrappeMessage<Inventory>>(`${METHOD}.cancel_inventory`)
  return {
    previewScope: async (scope: InventoryScopeInput) => (await preview.call({ payload: JSON.stringify(scope) })).message,
    createInventory: async (input: NewInventoryInput) => (await create.call({ payload: JSON.stringify(input) })).message,
    startInventory: async (name: string) => (await start.call({ name })).message,
    recordCounts: async (name: string, entries: CountEntryInput[]) =>
      (await record.call({ name, entries: JSON.stringify(entries) })).message,
    undoCount: async (name: string, clientUuid: string) => (await undo.call({ name, client_uuid: clientUuid })).message,
    itemBatches: async (name: string, itemCode: string, warehouse: string) =>
      (await batches.call({ name, item_code: itemCode, warehouse })).message,
    requestRecount: async (name: string, lines: string[]) =>
      (await recount.call({ name, lines: JSON.stringify(lines) })).message,
    finishCounting: async (name: string) => (await finish.call({ name })).message,
    reopenCounting: async (name: string) => (await reopen.call({ name })).message,
    validateInventory: async (name: string, zeroUncounted: boolean) =>
      (await validate.call({ name, zero_uncounted: zeroUncounted ? 1 : 0 })).message,
    cancelInventory: async (name: string) => (await cancel.call({ name })).message,
    pending:
      create.loading || start.loading || recount.loading || finish.loading || reopen.loading || validate.loading || cancel.loading,
  }
}
