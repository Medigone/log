import type {
  CustomerSummary,
  ItemCard,
  OrderDetail,
  OrderOptions,
  OrderPayload,
  OrderUpdatePayload,
} from "@/shared/api/orders";

export interface OrderLine {
  /** Clé locale : les lignes ERPNext sont recréées à chaque enregistrement. */
  key: string;
  itemCode: string;
  itemName: string;
  uom: string;
  qty: number;
  /** null = remise ERPNext (règle de prix) ; sinon remise saisie en %. */
  discount: number | null;
  /** Prix saisi, seulement si ERPNext autorise la modification du prix de liste. */
  rate: number | null;
  image?: string | null;
  available: number;
  isStockItem: boolean;
  /** Prix connu au moment de l'ajout, affiché en attendant l'aperçu serveur. */
  listPrice?: number | null;
  /** Ligne ERPNext existante (commande enregistrée). */
  rowName?: string | null;
  /** null = réservation automatique : toute la quantité, dans la limite du disponible. */
  reservedQty: number | null;
  /** Quantité déjà livrée (commande validée). */
  delivered: number;
}

export interface ManualScheduleRow {
  key: string;
  dueDate: string;
  amount: number;
  mode: string;
}

export interface OrderDraft {
  name: string | null;
  customer: CustomerSummary | null;
  lines: OrderLine[];
  orderType: string;
  deliveryDate: string;
  warehouse: string;
  /** "" = liste du client (ou des Paramètres de vente). */
  priceList: string;
  /** "" = aucune taxe. */
  taxTemplate: string;
  discountMode: "percent" | "amount";
  discountValue: number;
  paymentTermsTemplate: string;
  scheduleMode: "template" | "manual";
  schedule: ManualScheduleRow[];
}

let keySeed = 0;
export function newKey(prefix = "line") {
  keySeed += 1;
  return `${prefix}-${keySeed}`;
}

export function emptyDraft(options?: OrderOptions): OrderDraft {
  return {
    name: null,
    customer: null,
    lines: [],
    orderType: options?.order_types?.[0] || "BL",
    deliveryDate: options?.default_delivery_date || "",
    warehouse: options?.default_warehouse || "",
    priceList: "",
    taxTemplate: options?.default_tax_template || "",
    discountMode: "percent",
    discountValue: 0,
    paymentTermsTemplate: "",
    scheduleMode: "template",
    schedule: [],
  };
}

export function draftFromOrder(order: OrderDetail, makeKey = newKey): OrderDraft {
  const amountMode = !order.additional_discount_percentage && order.discount_amount > 0;
  return {
    name: order.name,
    customer: order.customer,
    lines: order.lines.map((line) => ({
      key: makeKey(),
      itemCode: line.item_code,
      itemName: line.item_name,
      uom: line.uom,
      qty: line.qty,
      discount: line.discount_percentage || null,
      rate: null,
      image: line.image,
      available: line.available,
      isStockItem: true,
      listPrice: line.price_list_rate,
      rowName: line.row_name ?? null,
      reservedQty: line.reserved_qty ?? null,
      delivered: line.delivered_qty ?? 0,
    })),
    orderType: order.order_type,
    deliveryDate: order.delivery_date,
    warehouse: order.warehouse || "",
    priceList: order.price_list || "",
    taxTemplate: order.tax_template || "",
    discountMode: amountMode ? "amount" : "percent",
    discountValue: amountMode ? order.discount_amount : order.additional_discount_percentage,
    paymentTermsTemplate: order.payment_terms_template || "",
    scheduleMode: order.schedule_mode === "manual" && order.payment_schedule.length > 1 ? "manual" : "template",
    schedule:
      order.schedule_mode === "manual"
        ? order.payment_schedule.map((row) => ({
            key: makeKey("echeance"),
            dueDate: row.due_date,
            amount: row.payment_amount,
            mode: row.mode_of_payment || "",
          }))
        : [],
  };
}

/** `12*3017620422003` → 12 fois le code ; un code seul → 1. */
export function parseQuantityScan(raw: string): { code: string; qty: number } {
  const value = raw.trim();
  const match = /^(\d+(?:[.,]\d+)?)\s*[*xX]\s*(.+)$/.exec(value);
  if (!match) return { code: value, qty: 1 };
  const qty = Number(match[1].replace(",", "."));
  return { code: match[2].trim(), qty: qty > 0 ? qty : 1 };
}

/** Ajoute à la ligne existante de l'article, ou crée la ligne en fin de commande. */
export function addOrderItem(
  lines: OrderLine[],
  item: ItemCard,
  qty: number,
  makeKey = newKey,
): { lines: OrderLine[]; key: string; created: boolean } {
  const amount = qty > 0 ? qty : 1;
  const existing = lines.find((line) => line.itemCode === item.item_code);
  if (existing) {
    return {
      lines: lines.map((line) => (line.key === existing.key ? { ...line, qty: line.qty + amount } : line)),
      key: existing.key,
      created: false,
    };
  }
  const line: OrderLine = {
    key: makeKey(),
    itemCode: item.item_code,
    itemName: item.item_name,
    uom: item.uom,
    qty: amount,
    discount: null,
    rate: null,
    image: item.image,
    available: item.available,
    isStockItem: item.is_stock_item,
    listPrice: item.price ?? null,
    rowName: null,
    reservedQty: null,
    delivered: 0,
  };
  return { lines: [...lines, line], key: line.key, created: true };
}

export function updateOrderLine(lines: OrderLine[], key: string, patch: Partial<OrderLine>) {
  return lines.map((line) => (line.key === key ? { ...line, ...patch } : line));
}

export function removeOrderLine(lines: OrderLine[], key: string) {
  return lines.filter((line) => line.key !== key);
}

function toLineInput(line: OrderLine) {
  return {
    item_code: line.itemCode,
    qty: line.qty,
    discount_percentage: line.discount,
    rate: line.rate,
    reserved_qty: line.reservedQty,
    row_name: line.rowName ?? null,
  };
}

/** Modification d'une commande validée : lignes, date de livraison et réservations. */
export function toUpdatePayload(draft: OrderDraft): OrderUpdatePayload | null {
  if (!draft.name) return null;
  return {
    name: draft.name,
    lines: draft.lines.filter((line) => line.qty > 0).map(toLineInput),
    delivery_date: draft.deliveryDate,
  };
}

/** Une ligne en partie livrée ne descend pas sous le livré et ne peut pas être retirée. */
export function submittedLineRules(line: Pick<OrderLine, "delivered">) {
  return { minQty: line.delivered, removable: line.delivered <= 0 };
}

export function toOrderPayload(draft: OrderDraft): OrderPayload | null {
  if (!draft.customer) return null;
  const lines = draft.lines.filter((line) => line.qty > 0);
  return {
    name: draft.name,
    customer: draft.customer.name,
    lines: lines.map(toLineInput),
    order_type: draft.orderType,
    delivery_date: draft.deliveryDate,
    warehouse: draft.warehouse || null,
    price_list: draft.priceList || null,
    tax_template: draft.taxTemplate,
    additional_discount_percentage: draft.discountMode === "percent" ? draft.discountValue : 0,
    discount_amount: draft.discountMode === "amount" ? draft.discountValue : 0,
    payment_terms_template: draft.scheduleMode === "manual" ? "" : draft.paymentTermsTemplate,
    payment_schedule:
      draft.scheduleMode === "manual"
        ? draft.schedule.map((row) => ({ due_date: row.dueDate, payment_amount: row.amount, mode_of_payment: row.mode || null }))
        : null,
  };
}

/** Reste à répartir (positif) ou trop réparti (négatif), à 2 décimales. */
export function scheduleGap(rows: ManualScheduleRow[], total: number) {
  const sum = rows.reduce((acc, row) => acc + (row.amount || 0), 0);
  return Math.round((total - sum) * 100) / 100;
}

/** Ajoute l'écart sur la dernière échéance. */
export function balanceSchedule(rows: ManualScheduleRow[], total: number): ManualScheduleRow[] {
  if (!rows.length) return rows;
  const gap = scheduleGap(rows, total);
  return rows.map((row, index) =>
    index === rows.length - 1 ? { ...row, amount: Math.round((row.amount + gap) * 100) / 100 } : row,
  );
}

export function scheduleFromPreview(
  rows: Array<{ due_date: string; payment_amount: number; mode_of_payment?: string | null }>,
  makeKey = newKey,
): ManualScheduleRow[] {
  return rows.map((row) => ({
    key: makeKey("echeance"),
    dueDate: row.due_date,
    amount: row.payment_amount,
    mode: row.mode_of_payment || "",
  }));
}

export interface OrderWarnings {
  blocking: string[];
  warnings: string[];
}

export function orderWarnings(draft: OrderDraft, preview?: OrderDetail | null): OrderWarnings {
  const blocking: string[] = [];
  const warnings: string[] = [];
  if (!draft.customer) blocking.push("Choisissez un client.");
  const lines = draft.lines.filter((line) => line.qty > 0);
  if (!lines.length) blocking.push("Ajoutez au moins un article.");
  if (!draft.deliveryDate) blocking.push("Indiquez la date de livraison.");
  if (draft.scheduleMode === "manual" && preview) {
    const gap = scheduleGap(draft.schedule, preview.totals.rounded_total);
    if (Math.abs(gap) > 0.1) blocking.push(`L’échéancier ne correspond pas au total (écart de ${gap.toFixed(2)} DZD).`);
    if (draft.schedule.some((row) => !row.dueDate)) blocking.push("Chaque échéance doit avoir une date.");
  }
  for (const line of draft.lines) {
    if (line.delivered > 0 && line.qty < line.delivered) {
      blocking.push(`${line.itemName} : la quantité ne peut pas descendre sous le livré (${line.delivered}).`);
    }
  }
  const reserved = new Map((preview?.lines ?? []).map((row) => [row.item_code, row.reserved_qty]));
  for (const line of lines) {
    if (line.isStockItem && line.qty > line.available) {
      warnings.push(`${line.itemName} : ${line.qty} demandé, ${Math.max(0, line.available)} disponible.`);
    }
    const lineReserved = line.reservedQty ?? reserved.get(line.itemCode);
    if (line.isStockItem && lineReserved != null && lineReserved < line.qty && line.qty <= line.available) {
      warnings.push(`${line.itemName} : ${lineReserved} réservé sur ${line.qty}.`);
    }
  }
  if (preview) {
    for (const line of preview.lines) {
      if (!line.price_list_rate && !line.rate) warnings.push(`${line.item_name} : aucun prix dans la liste.`);
    }
  }
  if (draft.customer && !draft.customer.has_gps) warnings.push("Le client n’a pas de position GPS : la tournée devra la compléter.");
  return { blocking, warnings };
}
