export interface PickLine {
  /** Nom de la ligne de Pick List (clé des quantités persistées). */
  key: string;
  itemCode: string;
  itemName: string;
  barcode?: string;
  warehouse?: string;
  salesOrder?: string;
  requested: number;
  uom?: string;
}

export type ScanTone = "idle" | "ok" | "warn" | "error";
export type ScanEntryMode = "unit" | "qty";

export interface ScanLogEntry {
  id: string;
  key?: string;
  amount: number;
  code: string;
  label: string;
  time: string;
  tone: ScanTone;
}

export function scanClock() {
  const date = new Date();
  return [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((part) => String(part).padStart(2, "0"))
    .join(":");
}
