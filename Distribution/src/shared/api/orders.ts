import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";

interface FrappeMessage<T> { message: T }

export type OrderListFilter = "all" | "brouillon" | "a_livrer" | "partielle" | "soumise" | "annulee";
export type OrderOrigin = "Interne" | "Portail client";

export interface OrderOptions {
  company: string;
  currency: string | null;
  warehouses: string[];
  default_warehouse: string | null;
  price_lists: string[];
  default_price_list: string | null;
  tax_templates: Array<{ name: string; label: string }>;
  default_tax_template: string | null;
  payment_terms_templates: string[];
  modes_of_payment: string[];
  customer_groups: string[];
  legal_forms: string[];
  order_types: string[];
  editable_rate: boolean;
  default_delivery_date: string;
  can_validate: boolean;
}

export interface CustomerSummary {
  name: string;
  customer_name: string;
  customer_group?: string | null;
  commune?: string | null;
  commune_name?: string | null;
  wilaya?: string | null;
  phone?: string | null;
  default_price_list?: string | null;
  payment_terms?: string | null;
  has_gps: boolean;
  status?: string | null;
}

export interface CommuneOption {
  name: string;
  nom: string;
  wilaya?: string | null;
}

export interface ItemCard {
  item_code: string;
  item_name: string;
  item_group?: string | null;
  brand?: string | null;
  image?: string | null;
  uom: string;
  barcode?: string | null;
  price?: number | null;
  available: number;
  is_stock_item: boolean;
}

export interface RecentItemCard extends ItemCard {
  last_qty: number;
  times_ordered: number;
}

export type OrderScanResult =
  | { found: false; barcode: string }
  | (ItemCard & { found: true; increment: number; barcode: string });

export type ScannedOrderItem = Extract<OrderScanResult, { found: true }>;

export interface OrderLineData {
  item_code: string;
  item_name: string;
  uom: string;
  qty: number;
  price_list_rate: number;
  discount_percentage: number;
  rate: number;
  amount: number;
  image?: string | null;
  available: number;
  pricing_rules?: string | null;
  row_name?: string | null;
  reserved_qty: number;
  delivered_qty: number;
  picked_qty: number;
  remaining_qty: number;
}

export type DeliveryState = "non_livree" | "partielle" | "livree";

export interface OrderTracking {
  pick_lists: Array<{ name: string; docstatus: number; status?: string | null }>;
  delivery_notes: Array<{ name: string; docstatus: number; status?: string | null; route?: string | null }>;
  blockers: string[];
}

export interface ScheduleRowData {
  payment_term?: string | null;
  due_date: string;
  invoice_portion: number;
  payment_amount: number;
  mode_of_payment?: string | null;
}

export interface OrderTotals {
  qty: number;
  total: number;
  discount_amount: number;
  net_total: number;
  taxes: number;
  grand_total: number;
  rounding_adjustment: number;
  rounded_total: number;
}

export interface OrderDetail {
  name: string | null;
  docstatus: number;
  status?: string | null;
  origin: OrderOrigin;
  editable: boolean;
  owner?: string;
  customer: CustomerSummary | null;
  transaction_date: string;
  delivery_date: string;
  order_type: string;
  warehouse: string | null;
  price_list: string | null;
  tax_template: string;
  payment_terms_template: string;
  schedule_mode: "template" | "manual";
  additional_discount_percentage: number;
  discount_amount: number;
  currency?: string | null;
  lines: OrderLineData[];
  taxes: Array<{ description: string; rate: number; amount: number }>;
  payment_schedule: ScheduleRowData[];
  schedule_gap: number;
  totals: OrderTotals;
  per_delivered: number;
  per_picked: number;
  delivery_state: DeliveryState;
  can_edit_items: boolean;
  can_cancel: boolean;
  can_delete: boolean;
  pick_lists: OrderTracking["pick_lists"];
  delivery_notes: OrderTracking["delivery_notes"];
  blockers: string[];
}

export interface OrderSummary {
  name: string;
  customer: string;
  customer_name: string;
  transaction_date: string;
  delivery_date: string;
  total_qty: number;
  total: number;
  status: string;
  docstatus: number;
  per_delivered: number;
  delivery_state: DeliveryState;
  origin: OrderOrigin;
  order_type?: string | null;
  wilaya?: string | null;
  owner: string;
  owner_name: string;
  modified: string;
}

export interface OrderCounts {
  a_livrer: number;
  brouillons: number;
  brouillons_portail: number;
  soumises_aujourdhui: number;
  montant_aujourdhui: number;
}

export interface OrderLineInput {
  item_code: string;
  qty: number;
  discount_percentage?: number | null;
  rate?: number | null;
  /** null = réservation automatique (toute la quantité, dans la limite du disponible). */
  reserved_qty?: number | null;
  row_name?: string | null;
}

export interface OrderUpdatePayload {
  name: string;
  lines: OrderLineInput[];
  delivery_date: string;
}

export interface OrderPayload {
  name?: string | null;
  customer: string;
  lines: OrderLineInput[];
  order_type: string;
  delivery_date: string;
  warehouse?: string | null;
  price_list?: string | null;
  tax_template: string;
  additional_discount_percentage?: number;
  discount_amount?: number;
  payment_terms_template: string;
  payment_schedule?: Array<{ due_date: string; payment_amount: number; mode_of_payment?: string | null }> | null;
}

export interface NewCustomerInput {
  customer_name: string;
  customer_group: string;
  commune: string;
  legal_form: string;
  phone?: string;
  nif?: string;
  rc?: string;
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  Draft: "À valider",
  "To Deliver and Bill": "À livrer",
  "To Deliver": "À livrer",
  "To Bill": "Livrée",
  Completed: "Terminée",
  Closed: "Clôturée",
  "On Hold": "En attente",
  Cancelled: "Annulée",
};

/** PDF d'une ou plusieurs commandes, ouvert dans un nouvel onglet (imprimer ou enregistrer). */
export function orderPdfUrl(names: string[]) {
  return `/api/method/log.order_print.download_orders_pdf?names=${encodeURIComponent(JSON.stringify(names))}`;
}

export function openOrdersPdf(names: string[]) {
  if (!names.length) return;
  window.open(orderPdfUrl(names), "_blank", "noopener");
}

export function orderStatusLabel(status?: string | null, docstatus = 0, perDelivered = 0) {
  if (docstatus === 0) return "À valider";
  if (docstatus === 2) return "Annulée";
  if (status !== "Closed" && status !== "On Hold" && perDelivered > 0 && perDelivered < 100) return "Partiellement livrée";
  return (status && ORDER_STATUS_LABELS[status]) || status || "Validée";
}

export function useOrderOptions() {
  return useFrappeGetCall<FrappeMessage<OrderOptions>>(
    "log.order_entry_ops.get_order_options",
    {},
    "distribution-order-options",
    { revalidateOnFocus: false },
  );
}

export function useOrders(status: OrderListFilter, origin: string, mine: boolean) {
  return useFrappeGetCall<FrappeMessage<{ orders: OrderSummary[]; counts: OrderCounts }>>(
    "log.order_entry_ops.list_orders",
    { status, origin, mine: mine ? 1 : 0, limit: 300 },
    `distribution-orders-${status}-${origin}-${mine ? 1 : 0}`,
  );
}

export function useOrderCounts(enabled: boolean) {
  return useFrappeGetCall<FrappeMessage<OrderCounts>>(
    "log.order_entry_ops.get_order_counts",
    {},
    enabled ? "distribution-order-counts" : null,
    { refreshInterval: 60_000, refreshWhenHidden: false },
  );
}

export function useOrder(name?: string) {
  return useFrappeGetCall<FrappeMessage<OrderDetail>>(
    "log.order_entry_ops.get_order",
    name ? { name } : undefined,
    name ? `distribution-order-${name}` : null,
    { revalidateOnFocus: false },
  );
}

export function useCustomerSearch(txt: string, enabled: boolean) {
  return useFrappeGetCall<FrappeMessage<CustomerSummary[]>>(
    "log.order_entry_ops.search_customers",
    { txt },
    enabled ? `distribution-customer-search-${txt}` : null,
    { revalidateOnFocus: false, keepPreviousData: true },
  );
}

export function useCommuneSearch(txt: string, enabled: boolean) {
  return useFrappeGetCall<FrappeMessage<CommuneOption[]>>(
    "log.order_entry_ops.search_communes",
    { txt },
    enabled ? `distribution-commune-search-${txt}` : null,
    { revalidateOnFocus: false, keepPreviousData: true },
  );
}

export function useItemSearch(
  txt: string,
  context: { customer?: string | null; priceList?: string | null; warehouse?: string | null },
  enabled: boolean,
) {
  const params = { txt, customer: context.customer || "", price_list: context.priceList || "", warehouse: context.warehouse || "" };
  return useFrappeGetCall<FrappeMessage<ItemCard[]>>(
    "log.order_entry_ops.search_items",
    params,
    enabled ? `distribution-item-search-${JSON.stringify(params)}` : null,
    { revalidateOnFocus: false, keepPreviousData: true },
  );
}

export function useCustomerRecentItems(customer: string | null | undefined, priceList?: string | null, warehouse?: string | null) {
  const params = { customer: customer || "", price_list: priceList || "", warehouse: warehouse || "" };
  return useFrappeGetCall<FrappeMessage<RecentItemCard[]>>(
    "log.order_entry_ops.customer_recent_items",
    params,
    customer ? `distribution-customer-recent-${JSON.stringify(params)}` : null,
    { revalidateOnFocus: false },
  );
}

export function useOrderMutations() {
  const preview = useFrappePostCall<FrappeMessage<OrderDetail>>("log.order_entry_ops.preview_order");
  const save = useFrappePostCall<FrappeMessage<OrderDetail>>("log.order_entry_ops.save_order");
  const submit = useFrappePostCall<FrappeMessage<OrderDetail>>("log.order_entry_ops.submit_order");
  const remove = useFrappePostCall<FrappeMessage<{ deleted: string }>>("log.order_entry_ops.delete_order");
  const scan = useFrappePostCall<FrappeMessage<OrderScanResult>>("log.order_entry_ops.scan_order_item");
  const createCustomer = useFrappePostCall<FrappeMessage<CustomerSummary>>("log.order_entry_ops.create_customer");
  const previewUpdate = useFrappePostCall<FrappeMessage<OrderDetail>>("log.order_entry_ops.preview_order_update");
  const update = useFrappePostCall<FrappeMessage<OrderDetail>>("log.order_entry_ops.update_submitted_order");
  const cancel = useFrappePostCall<FrappeMessage<OrderDetail>>("log.order_entry_ops.cancel_order");
  const amend = useFrappePostCall<FrappeMessage<{ name: string; amended_from: string }>>("log.order_entry_ops.amend_order");
  return {
    previewOrder: async (payload: OrderPayload) => (await preview.call({ payload })).message,
    saveOrder: async (payload: OrderPayload) => (await save.call({ payload })).message,
    submitOrder: async (name: string) => (await submit.call({ name })).message,
    deleteOrder: async (name: string) => (await remove.call({ name })).message,
    scanOrderItem: async (
      searchValue: string,
      context: { customer?: string | null; priceList?: string | null; warehouse?: string | null },
    ) =>
      (
        await scan.call({
          search_value: searchValue,
          customer: context.customer || "",
          price_list: context.priceList || "",
          warehouse: context.warehouse || "",
        })
      ).message,
    createCustomer: async (payload: NewCustomerInput) => (await createCustomer.call({ payload })).message,
    previewOrderUpdate: async (payload: OrderUpdatePayload) => (await previewUpdate.call({ payload })).message,
    updateSubmittedOrder: async (payload: OrderUpdatePayload) => (await update.call({ payload })).message,
    cancelOrder: async (name: string) => (await cancel.call({ name })).message,
    amendOrder: async (name: string) => (await amend.call({ name })).message,
    saving: save.loading,
    submitting: submit.loading,
    deleting: remove.loading,
    scanning: scan.loading,
    creatingCustomer: createCustomer.loading,
    updating: update.loading,
    cancelling: cancel.loading,
    amending: amend.loading,
  };
}
