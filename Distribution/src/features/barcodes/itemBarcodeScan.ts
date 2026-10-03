export type ItemBarcodeRow = {
  name?: string
  barcode: string
  barcodeType?: string
  uom?: string
}

export type ItemUom = {
  uom: string
  conversionFactor: number
}

export type ItemBarcodeSummary = {
  itemCode: string
  itemName: string
  stockUom: string
  image?: string
  barcodeCount: number
}

export type ItemBarcodeItem = {
  itemCode: string
  itemName: string
  stockUom: string
  image?: string
  disabled?: number
  barcodes: ItemBarcodeRow[]
  uoms: ItemUom[]
  already?: boolean
}

export type BarcodeLookup = {
  barcode: string
  item: ItemBarcodeItem | null
}

export type ScanAssignDecision =
  | { action: "open-item"; item: ItemBarcodeItem }
  | { action: "already"; item: ItemBarcodeItem }
  | { action: "conflict"; barcode: string; item: ItemBarcodeItem }
  | { action: "add"; itemCode: string; barcode: string }
  | { action: "pending"; barcode: string }

export function normalizeScannedBarcode(value: string) {
  return value.trim()
}

export function decideScanAction(
  barcode: string,
  lookedUp: ItemBarcodeItem | null,
  selectedItemCode: string | null,
): ScanAssignDecision {
  const code = normalizeScannedBarcode(barcode)
  if (lookedUp) {
    if (selectedItemCode && lookedUp.itemCode !== selectedItemCode) {
      return { action: "conflict", barcode: code, item: lookedUp }
    }
    if (selectedItemCode && lookedUp.itemCode === selectedItemCode) {
      return { action: "already", item: lookedUp }
    }
    return { action: "open-item", item: lookedUp }
  }
  if (selectedItemCode) return { action: "add", itemCode: selectedItemCode, barcode: code }
  return { action: "pending", barcode: code }
}
