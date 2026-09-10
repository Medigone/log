import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk"
import { apiErrorMessage } from "@/shared/api/distribution"
import type { BarcodeLookup, ItemBarcodeItem, ItemBarcodeSummary } from "@/features/barcodes/itemBarcodeScan"

interface FrappeMessage<T> {
  message: T
}

export { apiErrorMessage }

export function useItemBarcodeSearch(query: string, missingOnly: boolean) {
  const trimmed = query.trim()
  return useFrappeGetCall<FrappeMessage<ItemBarcodeSummary[]>>(
    "log.api.item_barcodes.search_items",
    { query: trimmed, missing_only: missingOnly ? 1 : 0 },
    `item-barcodes-search-${trimmed}-${missingOnly ? 1 : 0}`,
  )
}

export function useItemBarcode(itemCode: string | null) {
  const code = itemCode?.trim() || ""
  return useFrappeGetCall<FrappeMessage<ItemBarcodeItem>>(
    "log.api.item_barcodes.get_item",
    { item_code: code },
    code ? `item-barcodes-item-${code}` : null,
  )
}

export function useItemBarcodeMutations() {
  const lookup = useFrappePostCall<FrappeMessage<BarcodeLookup>>("log.api.item_barcodes.lookup_barcode")
  const add = useFrappePostCall<FrappeMessage<ItemBarcodeItem>>("log.api.item_barcodes.add_barcode")
  const remove = useFrappePostCall<FrappeMessage<ItemBarcodeItem>>("log.api.item_barcodes.remove_barcode")
  return {
    lookupBarcode: async (barcode: string) => (await lookup.call({ barcode })).message,
    addBarcode: async (itemCode: string, barcode: string, uom?: string) =>
      (await add.call({ item_code: itemCode, barcode, uom })).message,
    removeBarcode: async (itemCode: string, barcode: string) =>
      (await remove.call({ item_code: itemCode, barcode })).message,
    lookingUp: lookup.loading,
    adding: add.loading,
    removing: remove.loading,
  }
}
