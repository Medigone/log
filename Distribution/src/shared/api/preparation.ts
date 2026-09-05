import { useEffect, useRef } from "react";
import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";

interface FrappeMessage<T> { message: T }

export interface StockShortage {
  item_code: string;
  item_name?: string;
  warehouse?: string;
  required: number;
  available: number;
}

export interface SalesOrderRow {
  name: string;
  customer?: string;
  customer_name?: string;
  transaction_date?: string;
  delivery_date?: string;
  grand_total?: number;
  total_qty?: number;
  per_picked?: number;
  per_delivered?: number;
  status?: string;
  picked_qty?: number;
  requested_qty?: number;
  pick_lists?: Array<{ name: string; docstatus: number }>;
  custom_commune?: string;
  custom_commune_nom?: string;
  custom_wilaya?: string;
  custom_preparation_status?: string | null;
  custom_preparation_accepte_par?: string | null;
  custom_preparation_date_acceptation?: string | null;
  draft_pick_list?: string;
  draft_pick_lists?: string[];
  existing_pick_list?: string;
  can_create_pick_list?: boolean;
  has_available_stock?: boolean;
  pick_incomplete?: boolean;
  ready_to_complete?: boolean;
  uncovered_qty?: number;
  stock_shortages?: StockShortage[];
  items?: SalesOrderPickLine[];
}

export interface SalesOrderPickLine {
  item_code: string;
  item_name?: string;
  warehouse?: string;
  required: number;
  available: number;
  uom?: string;
  pick_list?: string | null;
}

export interface SalesOrderPickDetail extends SalesOrderRow {
  items: SalesOrderPickLine[];
}

export interface PickLocation {
  name: string;
  pick_list: string;
  item_code: string;
  item_name?: string;
  warehouse?: string;
  qty: number;
  stock_qty: number;
  picked_qty: number;
  sales_order?: string;
  uom?: string;
  stock_uom?: string;
}

export interface PickGroup {
  item_code: string;
  item_name?: string;
  warehouse?: string;
  stock_qty: number;
  picked_qty?: number;
  uom?: string;
  locations: PickLocation[];
  /** Compatibilité avec les anciennes réponses de session antérieures au correctif. */
  rows?: PickLocation[];
}

export function getPickGroupLocations(group: PickGroup): PickLocation[] {
  if (Array.isArray(group.locations)) return group.locations;
  if (Array.isArray(group.rows)) return group.rows;
  return [];
}

export interface PickScanResult {
  item_code: string;
  item_name?: string;
  uom?: string;
  increment: number;
  barcode?: string;
}

export type BarcodeScanApply =
  | { ok: true; locationName: string; itemCode: string; warehouse?: string; nextQty: number }
  | { ok: false; reason: "not_in_session" | "already_complete" };

export function applyBarcodeScan(
  locations: PickLocation[],
  picked: Record<string, number>,
  itemCode: string,
  increment: number,
): BarcodeScanApply {
  const matches = locations.filter((location) => location.item_code === itemCode);
  if (!matches.length) return { ok: false, reason: "not_in_session" };
  const step = increment > 0 ? increment : 1;
  for (const location of matches) {
    const current = picked[location.name] ?? location.picked_qty ?? 0;
    const remaining = location.stock_qty - current;
    if (remaining > 0) {
      return {
        ok: true,
        locationName: location.name,
        itemCode,
        warehouse: location.warehouse,
        nextQty: current + Math.min(step, remaining),
      };
    }
  }
  return { ok: false, reason: "already_complete" };
}

export interface DeliveryNoteResult {
  name: string;
  customer_name?: string;
  customer?: string;
  custom_qr_image?: string;
  image?: string;
  custom_statut?: string;
  status?: string;
}

export interface PickListData {
  name: string;
  docstatus: number;
  locations: PickLocation[];
  grouped: PickGroup[];
  sales_orders: string[];
  delivery_notes?: DeliveryNoteResult[];
  custom_order_changed?: number;
  custom_order_changed_reason?: string | null;
}

export interface PickSessionData {
  name: string;
  pick_lists: PickListData[];
  grouped: PickGroup[];
  sales_orders: string[];
  delivery_notes?: DeliveryNoteResult[];
  order_changed_notice?: string | null;
  modification_pending?: boolean;
  pending_sales_orders?: string[];
}

export interface RecentPickListItem {
  item_code: string;
  item_name?: string;
  warehouse?: string;
  sales_order?: string;
  requested_qty: number;
  picked_qty: number;
  uom?: string;
}

export interface RecentPickList {
  name: string;
  docstatus: number;
  status?: string;
  modified: string;
  sales_order_count: number;
  sales_orders?: string[];
  customer_names?: string[];
  wilayas?: string[];
  requested_qty?: number;
  picked_qty?: number;
  warehouses?: string[];
  delivery_notes: string[];
  items?: RecentPickListItem[];
  custom_order_changed?: number;
  custom_order_changed_reason?: string | null;
}

export function usePreparationQueue(options?: { live?: boolean }) {
  return useFrappeGetCall<FrappeMessage<SalesOrderRow[]>>(
    "log.pick_list_ops.get_sales_orders_to_pick",
    { limit: 200 },
    "distribution-preparation-queue",
    options?.live
      ? { refreshInterval: 10_000, refreshWhenHidden: false, refreshWhenOffline: false, revalidateOnFocus: true }
      : undefined,
  );
}

export function usePickList(name: string) {
  return useFrappeGetCall<FrappeMessage<PickListData>>(
    "log.pick_list_ops.get_pick_list",
    { pick_list: name },
    `distribution-pick-list-${name}`,
  );
}

export function usePickSession(names: string[]) {
  const key = names.join("-");
  return useFrappeGetCall<FrappeMessage<PickSessionData>>(
    "log.pick_list_ops.get_pick_session",
    { pick_lists: names },
    `distribution-pick-session-${key}`,
  );
}

export function useRecentPickLists() {
  return useFrappeGetCall<FrappeMessage<RecentPickList[]>>(
    "log.pick_list_ops.get_recent_pick_lists",
    { limit: 100 },
    "distribution-recent-pick-lists",
  );
}

export function useSalesOrderPickDetail(name?: string) {
  return useFrappeGetCall<FrappeMessage<SalesOrderPickDetail>>(
    "log.pick_list_ops.get_sales_order_pick_detail",
    name ? { sales_order: name } : undefined,
    name ? `distribution-sales-order-pick-${name}` : null,
  );
}

export function usePreparationMutations() {
  const create = useFrappePostCall<FrappeMessage<PickSessionData>>(
    "log.pick_list_ops.create_pick_list_from_sales_orders",
  );
  const update = useFrappePostCall<FrappeMessage<PickListData>>(
    "log.pick_list_ops.update_picked_qty",
  );
  const submit = useFrappePostCall<FrappeMessage<{ delivery_notes: DeliveryNoteResult[] }>>(
    "log.pick_list_ops.submit_pick_list_and_create_dns",
  );
  const scan = useFrappePostCall<FrappeMessage<PickScanResult>>(
    "log.pick_list_ops.scan_pick_item",
  );
  const acknowledge = useFrappePostCall<FrappeMessage<SalesOrderPickDetail>>(
    "log.order_change_ops.acknowledge_preparation_modification",
  );
  return {
    createPickList: async (salesOrders: string[]) => (await create.call({ sales_orders: salesOrders })).message,
    updateQuantities: async (pickList: string, locations: Array<{ name: string; picked_qty: number }>) =>
      (await update.call({ pick_list: pickList, locations })).message,
    submitPickList: async (pickList: string) => (await submit.call({ pick_list: pickList })).message,
    scanPickItem: async (searchValue: string, pickLists: string[]) =>
      (await scan.call({ search_value: searchValue, pick_lists: pickLists })).message,
    acknowledgeModification: async (salesOrder: string) =>
      (await acknowledge.call({ sales_order: salesOrder })).message,
    creating: create.loading,
    saving: update.loading,
    submitting: submit.loading,
    scanning: scan.loading,
    acknowledging: acknowledge.loading,
  };
}

export function orderIsModified(row?: { custom_preparation_status?: string | null } | null) {
  return row?.custom_preparation_status === "Modifiée";
}

export function orderReadyToComplete(row?: Pick<SalesOrderRow, "ready_to_complete"> | null) {
  return Boolean(row?.ready_to_complete);
}

export type PickLineState = "shortage" | "on_list" | "to_pick" | "ok";

export function pickLineState(line: Pick<SalesOrderPickLine, "required" | "available" | "pick_list">): PickLineState {
  if ((line.required || 0) <= 0.000001) return "ok";
  if (line.required > (line.available || 0) + 0.000001) return "shortage";
  if (line.pick_list) return "on_list";
  return "to_pick";
}

export function usePickListOrderChanged(pickListNames: string[], onChanged: (reason?: string) => void) {
  const namesKey = pickListNames.join("\0");
  const callbackRef = useRef(onChanged);
  callbackRef.current = onChanged;
  useEffect(() => {
    const realtime = (
      window as Window & {
        frappe?: { realtime?: { on: (event: string, handler: (data: unknown) => void) => void; off: (event: string, handler: (data: unknown) => void) => void } };
      }
    ).frappe?.realtime;
    if (!realtime?.on) return;
    const watched = namesKey.split("\0").filter(Boolean);
    const handler = (payload: unknown) => {
      const data = (payload || {}) as { pick_lists?: string[]; reason?: string };
      const incoming = data.pick_lists || [];
      if (incoming.some((name) => watched.includes(name))) {
        callbackRef.current(data.reason);
      }
    };
    realtime.on("log:pick_list_changed", handler);
    return () => {
      realtime.off?.("log:pick_list_changed", handler);
    };
  }, [namesKey]);
}
