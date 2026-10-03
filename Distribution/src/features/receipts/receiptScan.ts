import type { ReceiptDetail, ReceiptLineInput, ScannedItem } from "@/shared/api/receipts";

export interface ReceiptLine {
  /** Clé locale stable : les lignes ERPNext sont recréées à chaque enregistrement. */
  key: string;
  itemCode: string;
  itemName: string;
  uom?: string;
  qty: number;
  rate: number;
  barcode?: string | null;
  batchNo?: string | null;
  expiryDate?: string | null;
  hasBatchNo: boolean;
  hasExpiryDate: boolean;
}

let keySeed = 0;
export function newLineKey() {
  keySeed += 1;
  return `line-${keySeed}`;
}

export function linesFromReceipt(detail: ReceiptDetail, makeKey = newLineKey): ReceiptLine[] {
  return detail.lines.map((line) => ({
    key: makeKey(),
    itemCode: line.item_code,
    itemName: line.item_name || line.item_code,
    uom: line.uom,
    qty: line.qty,
    rate: line.rate,
    barcode: line.barcode,
    batchNo: line.batch_no,
    expiryDate: line.expiry_date,
    hasBatchNo: line.has_batch_no,
    hasExpiryDate: line.has_expiry_date,
  }));
}

export function toLineInputs(lines: ReceiptLine[]): ReceiptLineInput[] {
  return lines.map((line) => ({
    item_code: line.itemCode,
    qty: line.qty,
    rate: line.rate,
    barcode: line.barcode || null,
    batch_no: line.batchNo || null,
    expiry_date: line.expiryDate || null,
  }));
}

export interface ScanBatch {
  batchNo?: string | null;
  expiryDate?: string | null;
}

/**
 * Ajoute le pas du code-barres à la dernière ligne de l'article, ou crée la ligne. Pas de plafond.
 * Avec un lot : la ligne de ce lot, sinon une ligne de l'article encore sans lot, sinon une nouvelle ligne.
 */
export function applyReceiptScan(
  lines: ReceiptLine[],
  item: ScannedItem,
  makeKey = newLineKey,
  batch?: ScanBatch,
): { lines: ReceiptLine[]; key: string; amount: number; created: boolean } {
  const step = item.increment > 0 ? item.increment : 1;
  const batchNo = batch?.batchNo?.trim() || null;
  const lastIndex = (match: (line: ReceiptLine) => boolean) => {
    for (let index = lines.length - 1; index >= 0; index -= 1) if (match(lines[index])) return index;
    return -1;
  };
  const index = batchNo
    ? (() => {
        const sameBatch = lastIndex((line) => line.itemCode === item.item_code && line.batchNo === batchNo);
        return sameBatch >= 0 ? sameBatch : lastIndex((line) => line.itemCode === item.item_code && !line.batchNo);
      })()
    : lastIndex((line) => line.itemCode === item.item_code);
  if (index >= 0) {
    const target = lines[index];
    const patch: Partial<ReceiptLine> = { qty: target.qty + step };
    if (batchNo) {
      patch.batchNo = batchNo;
      if (batch?.expiryDate) patch.expiryDate = batch.expiryDate;
    }
    const next = lines.map((line, position) => (position === index ? { ...line, ...patch } : line));
    return { lines: next, key: target.key, amount: step, created: false };
  }
  const line: ReceiptLine = {
    key: makeKey(),
    itemCode: item.item_code,
    itemName: item.item_name || item.item_code,
    uom: item.uom,
    qty: step,
    rate: item.rate || 0,
    barcode: item.barcode,
    batchNo,
    expiryDate: batchNo ? batch?.expiryDate || null : null,
    hasBatchNo: item.has_batch_no,
    hasExpiryDate: item.has_expiry_date,
  };
  return { lines: [...lines, line], key: line.key, amount: step, created: true };
}

/** Retire `amount` à une ligne (annulation d'un scan) ; la ligne disparaît à zéro. */
export function undoReceiptScan(lines: ReceiptLine[], key: string, amount: number): ReceiptLine[] {
  return lines
    .map((line) => (line.key === key ? { ...line, qty: Math.max(0, line.qty - amount) } : line))
    .filter((line) => line.key !== key || line.qty > 0);
}

/** Ouvre une nouvelle ligne pour un autre lot du même article, juste après la ligne d'origine. */
export function splitBatch(lines: ReceiptLine[], key: string, makeKey = newLineKey) {
  const index = lines.findIndex((line) => line.key === key);
  if (index < 0) return { lines, key: null };
  const source = lines[index];
  const copy: ReceiptLine = { ...source, key: makeKey(), qty: 0, batchNo: null, expiryDate: null };
  return { lines: [...lines.slice(0, index + 1), copy, ...lines.slice(index + 1)], key: copy.key };
}

export function updateLine(lines: ReceiptLine[], key: string, patch: Partial<ReceiptLine>) {
  return lines.map((line) => (line.key === key ? { ...line, ...patch } : line));
}

export function removeLine(lines: ReceiptLine[], key: string) {
  return lines.filter((line) => line.key !== key);
}

export function receiptTotals(lines: ReceiptLine[]) {
  const counted = lines.filter((line) => line.qty > 0);
  return {
    lines: counted.length,
    items: new Set(counted.map((line) => line.itemCode)).size,
    qty: counted.reduce((sum, line) => sum + line.qty, 0),
    amount: counted.reduce((sum, line) => sum + line.qty * line.rate, 0),
  };
}

export interface ReceiptReview {
  /** Empêchent la validation (ERPNext refuserait le Reçu d'Achat). */
  blocking: string[];
  /** À vérifier, sans bloquer. */
  warnings: string[];
}

export function reviewReceipt(lines: ReceiptLine[]): ReceiptReview {
  const counted = lines.filter((line) => line.qty > 0);
  const blocking: string[] = [];
  const warnings: string[] = [];
  if (!counted.length) blocking.push("Aucun article n’a été scanné.");
  for (const line of counted) {
    const label = line.itemName || line.itemCode;
    if (line.hasBatchNo && !line.batchNo) blocking.push(`${label} : numéro de lot manquant.`);
    else if (line.hasExpiryDate && !line.expiryDate) blocking.push(`${label} : date de péremption manquante.`);
    if (line.rate <= 0) warnings.push(`${label} : prix d’achat à 0.`);
  }
  const empty = lines.length - counted.length;
  if (empty > 0) warnings.push(`${empty} ligne${empty > 1 ? "s" : ""} à quantité nulle ser${empty > 1 ? "ont" : "a"} ignorée${empty > 1 ? "s" : ""}.`);
  return { blocking, warnings };
}
