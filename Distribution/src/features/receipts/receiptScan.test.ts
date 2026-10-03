import { describe, expect, it } from "vitest";
import {
  applyReceiptScan,
  receiptTotals,
  reviewReceipt,
  splitBatch,
  toLineInputs,
  undoReceiptScan,
  type ReceiptLine,
} from "@/features/receipts/receiptScan";
import type { ScannedItem } from "@/shared/api/receipts";

const lait: ScannedItem = {
  found: true,
  item_code: "ART-1",
  item_name: "Lait 1er âge",
  uom: "N°",
  increment: 1,
  rate: 950,
  has_batch_no: true,
  has_expiry_date: true,
  barcode: "3017620422003",
};

function keys() {
  let n = 0;
  return () => `k${++n}`;
}

describe("applyReceiptScan", () => {
  it("crée la ligne au premier scan puis incrémente sans plafond", () => {
    const makeKey = keys();
    const first = applyReceiptScan([], lait, makeKey);
    expect(first.created).toBe(true);
    expect(first.lines[0]).toMatchObject({ key: "k1", qty: 1, rate: 950, hasBatchNo: true });

    let lines = first.lines;
    for (let i = 0; i < 5; i += 1) lines = applyReceiptScan(lines, lait, makeKey).lines;
    expect(lines).toHaveLength(1);
    expect(lines[0].qty).toBe(6);
  });

  it("applique le pas d'un code-barres carton", () => {
    const result = applyReceiptScan([], { ...lait, increment: 12 }, keys());
    expect(result.amount).toBe(12);
    expect(result.lines[0].qty).toBe(12);
  });

  it("incrémente le dernier lot ouvert de l'article", () => {
    const makeKey = keys();
    let lines = applyReceiptScan([], lait, makeKey).lines;
    lines = splitBatch(lines, "k1", makeKey).lines;
    const result = applyReceiptScan(lines, lait, makeKey);
    expect(result.key).toBe("k2");
    expect(result.lines.map((line) => line.qty)).toEqual([1, 1]);
  });
});

describe("undoReceiptScan", () => {
  it("retire le pas puis supprime la ligne à zéro", () => {
    const { lines } = applyReceiptScan([], { ...lait, increment: 2 }, keys());
    expect(undoReceiptScan(lines, "k1", 2)).toEqual([]);
    expect(undoReceiptScan([{ ...lines[0], qty: 5 }], "k1", 2)[0].qty).toBe(3);
  });
});

describe("reviewReceipt", () => {
  const base: ReceiptLine = {
    key: "k1",
    itemCode: "ART-1",
    itemName: "Lait",
    qty: 2,
    rate: 100,
    hasBatchNo: true,
    hasExpiryDate: true,
    batchNo: "L1",
    expiryDate: "2028-01-31",
  };

  it("bloque sans lot ou sans péremption", () => {
    expect(reviewReceipt([{ ...base, batchNo: null }]).blocking).toEqual(["Lait : numéro de lot manquant."]);
    expect(reviewReceipt([{ ...base, expiryDate: null }]).blocking).toEqual(["Lait : date de péremption manquante."]);
  });

  it("signale un prix nul et les lignes vides sans bloquer", () => {
    const review = reviewReceipt([{ ...base, rate: 0 }, { ...base, key: "k2", qty: 0 }]);
    expect(review.blocking).toEqual([]);
    expect(review.warnings).toHaveLength(2);
  });

  it("bloque une réception vide", () => {
    expect(reviewReceipt([]).blocking).toHaveLength(1);
  });

  it("calcule les totaux et le payload serveur", () => {
    const lines = [base, { ...base, key: "k2", itemCode: "ART-2", qty: 3, rate: 10, batchNo: null }];
    expect(receiptTotals(lines)).toEqual({ lines: 2, items: 2, qty: 5, amount: 230 });
    expect(toLineInputs(lines)[1]).toEqual({
      item_code: "ART-2",
      qty: 3,
      rate: 10,
      barcode: null,
      batch_no: null,
      expiry_date: "2028-01-31",
    });
  });
});

describe("applyReceiptScan avec lot", () => {
  it("affecte le lot à la ligne sans lot, cumule sur le même lot et ouvre une ligne pour un autre lot", () => {
    const makeKey = keys();
    let lines = applyReceiptScan([], lait, makeKey).lines;
    lines = applyReceiptScan(lines, { ...lait, increment: 5 }, makeKey, { batchNo: "L1", expiryDate: "2028-01-31" }).lines;
    expect(lines).toEqual([expect.objectContaining({ key: "k1", qty: 6, batchNo: "L1", expiryDate: "2028-01-31" })]);

    lines = applyReceiptScan(lines, { ...lait, increment: 2 }, makeKey, { batchNo: "L1" }).lines;
    expect(lines[0].qty).toBe(8);

    const result = applyReceiptScan(lines, { ...lait, increment: 3 }, makeKey, { batchNo: "L2", expiryDate: "2028-06-30" });
    expect(result.created).toBe(true);
    expect(result.lines.map((line) => [line.batchNo, line.qty])).toEqual([
      ["L1", 8],
      ["L2", 3],
    ]);
  });
});

