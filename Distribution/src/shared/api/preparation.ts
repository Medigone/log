import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";

interface FrappeMessage<T> { message: T }

export interface SalesOrderRow {
  name: string;
  customer?: string;
  customer_name?: string;
  transaction_date?: string;
  delivery_date?: string;
  grand_total?: number;
  total_qty?: number;
  per_picked?: number;
  custom_commune?: string;
  custom_wilaya?: string;
  draft_pick_list?: string;
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

export interface PickListData {
  name: string;
  docstatus: number;
  locations: PickLocation[];
  grouped: PickGroup[];
  sales_orders: string[];
}

export interface PickSessionData {
  name: string;
  pick_lists: PickListData[];
  grouped: PickGroup[];
  sales_orders: string[];
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

export interface RecentPickList {
  name: string;
  docstatus: number;
  status?: string;
  modified: string;
  sales_order_count: number;
  delivery_notes: string[];
}

export function usePreparationQueue() {
  return useFrappeGetCall<FrappeMessage<SalesOrderRow[]>>(
    "log.pick_list_ops.get_sales_orders_to_pick",
    { limit: 200 },
    "distribution-preparation-queue",
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
    { limit: 25 },
    "distribution-recent-pick-lists",
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
  return {
    createPickList: async (salesOrders: string[]) => (await create.call({ sales_orders: salesOrders })).message,
    updateQuantities: async (pickList: string, locations: Array<{ name: string; picked_qty: number }>) =>
      (await update.call({ pick_list: pickList, locations })).message,
    submitPickList: async (pickList: string) => (await submit.call({ pick_list: pickList })).message,
    creating: create.loading,
    saving: update.loading,
    submitting: submit.loading,
  };
}
