import { describe, expect, it } from "vitest";
import {
  addOrderItem,
  acceptListPrices,
  balanceSchedule,
  changedListPrice,
  draftFromOrder,
  emptyDraft,
  orderWarnings,
  parseQuantityScan,
  quotaLimit,
  scheduleGap,
  submittedLineRules,
  toOrderPayload,
  toUpdatePayload,
  type OrderDraft,
} from "@/features/orders/orderDraft";
import type { CustomerSummary, ItemCard, OrderDetail } from "@/shared/api/orders";

const customer: CustomerSummary = { name: "C-1", customer_name: "PHARMACIE TEST", has_gps: true };
const lait: ItemCard = { item_code: "ART-1", item_name: "Lait", uom: "N°", price: 950, available: 10, is_stock_item: true };

function keys() {
  let n = 0;
  return (prefix = "line") => `${prefix}-${++n}`;
}

describe("parseQuantityScan", () => {
  it("lit la quantité devant le code", () => {
    expect(parseQuantityScan("12*3017620422003")).toEqual({ code: "3017620422003", qty: 12 });
    expect(parseQuantityScan("2,5 x ART-1")).toEqual({ code: "ART-1", qty: 2.5 });
    expect(parseQuantityScan(" 3017620422003 ")).toEqual({ code: "3017620422003", qty: 1 });
  });
});

describe("addOrderItem", () => {
  it("crée la ligne puis cumule sur la même ligne", () => {
    const makeKey = keys();
    const first = addOrderItem([], lait, 1, makeKey);
    expect(first.created).toBe(true);
    expect(first.lines[0]).toMatchObject({ itemCode: "ART-1", qty: 1, listPrice: 950, discount: null });
    const second = addOrderItem(first.lines, lait, 12, makeKey);
    expect(second.created).toBe(false);
    expect(second.lines).toHaveLength(1);
    expect(second.lines[0].qty).toBe(13);
  });
});

describe("toOrderPayload", () => {
  it("n'envoie que les lignes utiles et la remise choisie", () => {
    const draft: OrderDraft = {
      ...emptyDraft(),
      customer,
      deliveryDate: "2026-10-04",
      discountMode: "amount",
      discountValue: 150,
      lines: [
        { ...addOrderItem([], lait, 2, keys()).lines[0], discount: 10 },
        { ...addOrderItem([], { ...lait, item_code: "ART-2" }, 1, keys()).lines[0], qty: 0 },
      ],
    };
    expect(toOrderPayload(draft)).toMatchObject({
      customer: "C-1",
      lines: [{ item_code: "ART-1", qty: 2, discount_percentage: 10, rate: null, reserved_qty: null, row_name: null }],
      additional_discount_percentage: 0,
      discount_amount: 150,
      payment_schedule: null,
    });
    expect(toOrderPayload({ ...draft, customer: null })).toBeNull();
  });

  it("envoie l'échéancier manuel sans modèle", () => {
    const draft: OrderDraft = {
      ...emptyDraft(),
      customer,
      paymentTermsTemplate: "30 jours",
      scheduleMode: "manual",
      schedule: [{ key: "e1", dueDate: "2026-10-03", amount: 500, mode: "Espèces" }],
    };
    expect(toOrderPayload(draft)).toMatchObject({
      payment_terms_template: "",
      payment_schedule: [{ due_date: "2026-10-03", payment_amount: 500, mode_of_payment: "Espèces" }],
    });
  });
});

describe("échéancier", () => {
  const rows = [
    { key: "e1", dueDate: "2026-10-03", amount: 1000, mode: "" },
    { key: "e2", dueDate: "2026-11-02", amount: 2000, mode: "" },
  ];

  it("calcule le reste et le reporte sur la dernière échéance", () => {
    expect(scheduleGap(rows, 4130)).toBe(1130);
    const balanced = balanceSchedule(rows, 4130);
    expect(balanced[1].amount).toBe(3130);
    expect(scheduleGap(balanced, 4130)).toBe(0);
  });
});

describe("orderWarnings", () => {
  it("bloque sans client ni article et signale le stock insuffisant", () => {
    expect(orderWarnings(emptyDraft()).blocking).toEqual(["Choisissez un client.", "Ajoutez au moins un article.", "Indiquez la date de livraison."]);
    const draft = { ...emptyDraft(), customer: { ...customer, has_gps: false }, deliveryDate: "2026-10-04", lines: addOrderItem([], lait, 12, keys()).lines };
    const result = orderWarnings(draft);
    expect(result.blocking).toEqual([]);
    expect(result.warnings).toEqual([
      "Lait : 12 demandé, 10 disponible.",
      "Le client n’a pas de position GPS : la tournée devra la compléter.",
    ]);
  });

  it("signale les articles sans taux de TVA sur leur fiche", () => {
    const draft = { ...emptyDraft(), customer, deliveryDate: "2026-10-04", lines: addOrderItem([], lait, 2, keys()).lines };
    const line = { item_code: "ART-1", item_name: "Lait", price_list_rate: 950, rate: 950, tax_rate: 0, tax_missing: true };
    const preview = { docstatus: 0, lines: [line] } as unknown as OrderDetail;
    expect(orderWarnings(draft, preview).warnings).toEqual(["Lait : taux de TVA non renseigné sur la fiche article, compté exonéré."]);
    const taxed = { docstatus: 0, lines: [{ ...line, tax_rate: 19, tax_missing: false }] } as unknown as OrderDetail;
    expect(orderWarnings(draft, taxed).warnings).toEqual([]);
  });
});

describe("draftFromOrder", () => {
  it("reprend une commande avec remise en montant et échéancier manuel", () => {
    const order = {
      name: "SO-1",
      customer,
      lines: [{ item_code: "ART-1", item_name: "Lait", uom: "N°", qty: 3, price_list_rate: 950, discount_percentage: 10, rate: 855, amount: 2565, available: 4 }],
      order_type: "Facture",
      delivery_date: "2026-10-04",
      warehouse: "Magasins - MP",
      price_list: "Vente standard",
      payment_terms_template: "",
      schedule_mode: "manual",
      additional_discount_percentage: 0,
      discount_amount: 65,
      payment_schedule: [
        { due_date: "2026-10-03", payment_amount: 1000, invoice_portion: 0 },
        { due_date: "2026-11-02", payment_amount: 1500, invoice_portion: 0, mode_of_payment: "Chèque" },
      ],
    } as unknown as OrderDetail;
    const draft = draftFromOrder(order, keys());
    expect(draft).toMatchObject({ name: "SO-1", orderType: "Facture", discountMode: "amount", discountValue: 65, scheduleMode: "manual" });
    expect(draft.lines[0]).toMatchObject({ itemCode: "ART-1", qty: 3, discount: 10 });
    expect(draft.schedule[1]).toMatchObject({ amount: 1500, mode: "Chèque" });
  });
});

describe("commande validée", () => {
  it("interdit de descendre sous le livré et de retirer une ligne livrée", () => {
    expect(submittedLineRules({ delivered: 2 })).toEqual({ minQty: 2, removable: false });
    expect(submittedLineRules({ delivered: 0 })).toEqual({ minQty: 0, removable: true });
    const line = { ...addOrderItem([], lait, 1, keys()).lines[0], qty: 1, delivered: 2 };
    const draft = { ...emptyDraft(), customer, deliveryDate: "2026-10-04", lines: [line] };
    expect(orderWarnings(draft).blocking).toEqual(["Lait : la quantité ne peut pas descendre sous le livré (2)."]);
  });

  it("envoie lignes, réservations et date pour la mise à jour", () => {
    const line = { ...addOrderItem([], lait, 3, keys()).lines[0], rowName: "SOI-1", reservedQty: 2 };
    const draft = { ...emptyDraft(), name: "SO-1", customer, deliveryDate: "2026-10-05", lines: [line] };
    expect(toUpdatePayload(draft)).toEqual({
      name: "SO-1",
      delivery_date: "2026-10-05",
      lines: [{ item_code: "ART-1", qty: 3, discount_percentage: null, rate: null, reserved_qty: 2, row_name: "SOI-1" }],
    });
    expect(toUpdatePayload({ ...draft, name: null })).toBeNull();
  });

  it("signale une réservation partielle", () => {
    const line = { ...addOrderItem([], lait, 4, keys()).lines[0], reservedQty: 1 };
    const draft = { ...emptyDraft(), customer, deliveryDate: "2026-10-04", lines: [line] };
    expect(orderWarnings(draft).warnings).toContain("Lait : 1 réservé sur 4.");
  });
});


describe("vente en quota", () => {
  const quota: ItemCard = { ...lait, quota_max_qty: 5 };

  it("plafonne le commercial au quota, pas le responsable", () => {
    const line = addOrderItem([], quota, 2, keys()).lines[0];
    expect(line.quotaMax).toBe(5);
    expect(quotaLimit(line, false)).toBe(5);
    expect(quotaLimit(line, true)).toBeNull();
    expect(quotaLimit(addOrderItem([], lait, 2, keys()).lines[0], false)).toBeNull();
  });

  it("garde une quantité déjà acceptée au-delà du quota", () => {
    const line = { ...addOrderItem([], quota, 8, keys()).lines[0], savedQty: 8 };
    expect(quotaLimit(line, false)).toBe(8);
  });

  it("bloque le commercial et avertit le responsable", () => {
    const line = addOrderItem([], quota, 7, keys()).lines[0];
    const draft = { ...emptyDraft(), customer, deliveryDate: "2026-10-04", lines: [line] };
    const message = "Lait : 7 demandé, quota de 5 par commande.";
    expect(orderWarnings(draft, null, false).blocking).toContain(message);
    expect(orderWarnings(draft, null, true).blocking).not.toContain(message);
    expect(orderWarnings(draft, null, true).warnings).toContain(message);
  });
});

describe("prix changé sur un brouillon", () => {
  it("détecte un tarif différent du prix gardé", () => {
    expect(changedListPrice({ price_list_rate: 150, current_price_list_rate: 160 })).toBe(160);
    expect(changedListPrice({ price_list_rate: 150, current_price_list_rate: 150 })).toBeNull();
    expect(changedListPrice({ price_list_rate: 150, current_price_list_rate: null })).toBeNull();
  });

  it("garde l’ancien prix jusqu’à la mise à jour, puis repart du tarif", () => {
    const line = { ...addOrderItem([], lait, 2, keys()).lines[0], lockedListPrice: 950 };
    const draft = { ...emptyDraft(), customer, deliveryDate: "2026-10-05", lines: [line] };
    expect(toOrderPayload(draft)?.lines[0].price_list_rate).toBe(950);
    const updated = { ...draft, lines: acceptListPrices(draft.lines, new Set([line.key])) };
    expect(toOrderPayload(updated)?.lines[0].price_list_rate).toBeNull();
  });
});
