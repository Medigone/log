import type {
  CustomerSummary,
  ItemCard,
  ItemStockOverview,
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
  /** Stock / réservé / en commande / disponible net de l’entrepôt (affichage). */
  stock?: ItemStockOverview | null;
  isStockItem: boolean;
  /** Prix connu au moment de l'ajout, affiché en attendant l'aperçu serveur. */
  listPrice?: number | null;
  /** Ligne ERPNext existante (commande enregistrée). */
  rowName?: string | null;
  /** null = réservation automatique : toute la quantité, dans la limite du disponible. */
  reservedQty: number | null;
  /** Quantité déjà livrée (commande validée). */
  delivered: number;
  /** Quantité max par commande si l’article est vendu en quota. */
  quotaMax?: number | null;
  /** Quantité déjà enregistrée : un dépassement accepté par le responsable reste conservable. */
  savedQty?: number;
  /** Prix de liste du brouillon enregistré ; null = tarif actuel de la liste. */
  lockedListPrice?: number | null;
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
      stock: line.stock ?? null,
      isStockItem: true,
      listPrice: line.price_list_rate,
      rowName: line.row_name ?? null,
      reservedQty: line.reserved_qty ?? null,
      delivered: line.delivered_qty ?? 0,
      quotaMax: line.quota_max_qty ?? null,
      savedQty: line.qty,
      lockedListPrice: order.docstatus === 0 ? line.price_list_rate : null,
    })),
    orderType: order.order_type,
    deliveryDate: order.delivery_date,
    warehouse: order.warehouse || "",
    priceList: order.price_list || "",
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
    stock: item.stock ?? null,
    isStockItem: item.is_stock_item,
    listPrice: item.price ?? null,
    rowName: null,
    reservedQty: null,
    delivered: 0,
    quotaMax: item.quota_max_qty ?? null,
    savedQty: 0,
  };
  return { lines: [...lines, line], key: line.key, created: true };
}

export function updateOrderLine(lines: OrderLine[], key: string, patch: Partial<OrderLine>) {
  return lines.map((line) => (line.key === key ? { ...line, ...patch } : line));
}

export function removeOrderLine(lines: OrderLine[], key: string) {
  return lines.filter((line) => line.key !== key);
}

/** Même modification sur plusieurs lignes (actions groupées). */
export function updateOrderLines(lines: OrderLine[], keys: Iterable<string>, patch: Partial<OrderLine>) {
  const selected = new Set(keys);
  return lines.map((line) => (selected.has(line.key) ? { ...line, ...patch } : line));
}

export function removeOrderLines(lines: OrderLine[], keys: Iterable<string>) {
  const selected = new Set(keys);
  return lines.filter((line) => !selected.has(line.key));
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

/**
 * Quantité max saisissable sur une ligne : le quota, ou la quantité déjà enregistrée si elle est plus haute.
 * null = pas de plafond (article hors quota, ou responsable autorisé à dépasser).
 */
export function quotaLimit(line: Pick<OrderLine, "quotaMax" | "savedQty">, canOverride: boolean): number | null {
  if (canOverride || !line.quotaMax) return null;
  return Math.max(line.quotaMax, line.savedQty ?? 0);
}

export function exceedsQuota(line: Pick<OrderLine, "quotaMax" | "qty">) {
  return Boolean(line.quotaMax) && line.qty > (line.quotaMax ?? 0);
}

/** Ramène la quantité d’une ligne sous son plafond de quota. */
export function capToQuota(line: OrderLine, canOverride: boolean): OrderLine {
  const limit = quotaLimit(line, canOverride);
  return limit != null && line.qty > limit ? { ...line, qty: limit } : line;
}

/** Tarif actuel différent du prix gardé par le brouillon ; null si le prix n’a pas changé. */
export function changedListPrice(row: { price_list_rate: number; current_price_list_rate?: number | null } | undefined) {
  const current = row?.current_price_list_rate;
  if (row == null || current == null || Math.abs(current - row.price_list_rate) < 0.005) return null;
  return current;
}

/** Le brouillon passe au tarif actuel pour les lignes données. */
export function acceptListPrices(lines: OrderLine[], keys: Set<string>): OrderLine[] {
  return lines.map((line) => (keys.has(line.key) ? { ...line, lockedListPrice: null } : line));
}

/** Changer d'entrepôt repasse les réservations en automatique : elles valaient pour l'ancien stock. */
export function releaseReservations(lines: OrderLine[]): OrderLine[] {
  return lines.some((line) => line.reservedQty != null) ? lines.map((line) => ({ ...line, reservedQty: null })) : lines;
}

/** Changer de client ou de liste de prix repart du tarif de la nouvelle liste. */
export function releaseListPrices(lines: OrderLine[]): OrderLine[] {
  return lines.some((line) => line.lockedListPrice != null) ? lines.map((line) => ({ ...line, lockedListPrice: null })) : lines;
}

export function toOrderPayload(draft: OrderDraft): OrderPayload | null {
  if (!draft.customer) return null;
  const lines = draft.lines.filter((line) => line.qty > 0);
  return {
    name: draft.name,
    customer: draft.customer.name,
    lines: lines.map((line) => ({ ...toLineInput(line), price_list_rate: line.lockedListPrice ?? null })),
    order_type: draft.orderType,
    delivery_date: draft.deliveryDate,
    warehouse: draft.warehouse || null,
    price_list: draft.priceList || null,
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

export function orderWarnings(draft: OrderDraft, preview?: OrderDetail | null, canOverrideQuota = false): OrderWarnings {
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
    if (exceedsQuota(line)) {
      const limit = quotaLimit(line, canOverrideQuota);
      const message = `${line.itemName} : ${line.qty} demandé, quota de ${line.quotaMax} par commande.`;
      if (limit != null && line.qty > limit) blocking.push(message);
      else warnings.push(message);
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
    const noVat = preview.docstatus === 0 ? preview.lines.filter((line) => line.tax_missing) : [];
    if (noVat.length) {
      const names = noVat.map((line) => line.item_name).join(", ");
      warnings.push(
        noVat.length === 1
          ? `${names} : taux de TVA non renseigné sur la fiche article, compté exonéré.`
          : `${noVat.length} articles sans taux de TVA sur leur fiche, comptés exonérés : ${names}.`,
      );
    }
  }
  if (draft.customer && !draft.customer.has_gps) warnings.push("Le client n’a pas de position GPS : la tournée devra la compléter.");
  return { blocking, warnings };
}
