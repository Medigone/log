import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";

interface FrappeMessage<T> { message: T }

export type ReceiptStatus = "en_cours" | "a_valider" | "valide" | "annule";
export type ReceiptListFilter = "ouvertes" | "en_cours" | "a_valider" | "valide" | "all";

export interface ReceiptOptions {
  company: string | null;
  currency: string | null;
  warehouses: string[];
  default_warehouse: string | null;
  buying_price_list: string | null;
  selling_price_list: string | null;
  item_groups: string[];
  brands: string[];
  uoms: string[];
  default_uom: string;
  supplier_groups: string[];
  default_supplier_group: string | null;
  can_validate: boolean;
}

export interface SupplierOption {
  name: string;
  supplier_name: string;
  supplier_group?: string | null;
}

export interface ReceiptSummary {
  name: string;
  supplier: string;
  supplier_name: string;
  posting_date: string | null;
  warehouse: string | null;
  supplier_delivery_note?: string | null;
  total_qty: number;
  grand_total: number;
  currency?: string | null;
  lines: number;
  status: ReceiptStatus;
  owner?: string;
  modified?: string | null;
}

export interface ReceiptCounts {
  en_cours: number;
  a_valider: number;
  valide_30j: number;
}

export interface ReceiptLineData {
  item_code: string;
  item_name?: string;
  uom?: string;
  qty: number;
  rate: number;
  amount?: number;
  barcode?: string | null;
  batch_no?: string | null;
  expiry_date?: string | null;
  has_batch_no: boolean;
  has_expiry_date: boolean;
}

export interface ReceiptDetail {
  name: string;
  supplier: string;
  supplier_name: string;
  company: string;
  posting_date: string | null;
  warehouse: string | null;
  supplier_delivery_note?: string | null;
  currency?: string | null;
  docstatus: number;
  status: ReceiptStatus;
  ready: boolean;
  linked_to_purchase_order: boolean;
  total_qty: number;
  net_total: number;
  grand_total: number;
  modified?: string | null;
  owner?: string;
  lines: ReceiptLineData[];
}

export type ReceiptScanResult =
  | { found: false; barcode: string }
  | {
      found: true;
      item_code: string;
      item_name: string;
      uom: string;
      increment: number;
      rate: number;
      has_batch_no: boolean;
      has_expiry_date: boolean;
      is_stock_item?: boolean;
      barcode: string;
    };

export type ScannedItem = Extract<ReceiptScanResult, { found: true }>;

export interface NewReceiptInput {
  supplier: string;
  warehouse: string;
  posting_date?: string;
  supplier_delivery_note?: string;
}

export interface NewItemInput {
  barcode: string;
  item_code?: string;
  item_name: string;
  item_group: string;
  brand?: string;
  stock_uom: string;
  has_batch_no: boolean;
  buying_rate?: number | null;
  selling_rate?: number | null;
  ppa?: number | null;
  show_in_store?: boolean;
  company?: string | null;
  warehouse?: string | null;
  receipt?: string;
}

export interface ReceiptLineInput {
  item_code: string;
  qty: number;
  rate: number;
  barcode?: string | null;
  batch_no?: string | null;
  expiry_date?: string | null;
}

export const RECEIPT_STATUS_LABELS: Record<ReceiptStatus, string> = {
  en_cours: "En cours",
  a_valider: "À valider",
  valide: "Validée",
  annule: "Annulée",
};

/** Les erreurs multi-lignes du serveur sont jointes par `<br>`. */
export function splitServerMessage(message: string) {
  return message.split(/<br\s*\/?>/i).map((part) => part.trim()).filter(Boolean);
}

export function useReceiptOptions() {
  return useFrappeGetCall<FrappeMessage<ReceiptOptions>>(
    "log.receipt_ops.get_receipt_options",
    {},
    "distribution-receipt-options",
    { revalidateOnFocus: false },
  );
}

export function useReceipts(status: ReceiptListFilter) {
  return useFrappeGetCall<FrappeMessage<{ receipts: ReceiptSummary[]; counts: ReceiptCounts }>>(
    "log.receipt_ops.list_receipts",
    { status, limit: 200 },
    `distribution-receipts-${status}`,
  );
}

export function useReceiptCounts(enabled: boolean) {
  return useFrappeGetCall<FrappeMessage<ReceiptCounts>>(
    "log.receipt_ops.get_receipt_counts",
    {},
    enabled ? "distribution-receipt-counts" : null,
    { refreshInterval: 60_000, refreshWhenHidden: false },
  );
}

export function useReceipt(name?: string) {
  return useFrappeGetCall<FrappeMessage<ReceiptDetail>>(
    "log.receipt_ops.get_receipt",
    name ? { name } : undefined,
    name ? `distribution-receipt-${name}` : null,
    { revalidateOnFocus: false },
  );
}

export function useReceiptMutations() {
  const create = useFrappePostCall<FrappeMessage<ReceiptDetail>>("log.receipt_ops.create_receipt");
  const scan = useFrappePostCall<FrappeMessage<ReceiptScanResult>>("log.receipt_ops.scan_receipt_item");
  const save = useFrappePostCall<FrappeMessage<ReceiptDetail>>("log.receipt_ops.save_receipt_lines");
  const ready = useFrappePostCall<FrappeMessage<ReceiptDetail>>("log.receipt_ops.mark_receipt_ready");
  const submit = useFrappePostCall<FrappeMessage<ReceiptDetail>>("log.receipt_ops.submit_receipt");
  const remove = useFrappePostCall<FrappeMessage<{ deleted: string }>>("log.receipt_ops.delete_receipt");
  const createItem = useFrappePostCall<FrappeMessage<ScannedItem>>("log.receipt_ops.create_receipt_item");
  const createSupplier = useFrappePostCall<FrappeMessage<SupplierOption>>("log.receipt_ops.create_supplier");
  const searchSuppliers = useFrappePostCall<FrappeMessage<SupplierOption[]>>("log.receipt_ops.search_suppliers");
  return {
    createReceipt: async (payload: NewReceiptInput) => (await create.call({ payload })).message,
    scanReceiptItem: async (receipt: string, searchValue: string) =>
      (await scan.call({ receipt, search_value: searchValue })).message,
    saveLines: async (receipt: string, lines: ReceiptLineInput[]) => (await save.call({ receipt, lines })).message,
    markReady: async (receipt: string, value: boolean) =>
      (await ready.call({ receipt, ready: value ? 1 : 0 })).message,
    submitReceipt: async (receipt: string) => (await submit.call({ receipt })).message,
    deleteReceipt: async (receipt: string) => (await remove.call({ receipt })).message,
    createItem: async (payload: NewItemInput) => (await createItem.call({ payload })).message,
    createSupplier: async (supplierName: string, supplierGroup?: string) =>
      (await createSupplier.call({ payload: { supplier_name: supplierName, supplier_group: supplierGroup } })).message,
    searchSuppliers: async (txt: string) => (await searchSuppliers.call({ txt })).message,
    creating: create.loading,
    scanning: scan.loading,
    saving: save.loading,
    markingReady: ready.loading,
    submitting: submit.loading,
    deleting: remove.loading,
    creatingItem: createItem.loading,
    creatingSupplier: createSupplier.loading,
  };
}
