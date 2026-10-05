import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";

interface FrappeMessage<T> { message: T }

const API = "log.pilotage_ops";
const STATIC = { revalidateOnFocus: false, keepPreviousData: true } as const;

export interface PilotagePeriod {
  from_date: string;
  to_date: string;
}

/** Délais : moyenne, médiane, 9e décile (null sans donnée). */
export interface DurationStats {
  count: number;
  average: number | null;
  median: number | null;
  p90: number | null;
}

// --- Trésorerie -------------------------------------------------------------------

export interface ForecastBucket {
  label: string;
  from_date: string | null;
  to_date: string;
  invoices: number;
  orders: number;
  total: number;
}

export interface CashOverview {
  period: PilotagePeriod;
  totals: {
    collected: number;
    payments: number;
    by_method: Array<{ method: string; amount: number }>;
    expected: number;
    tour_paid: number;
    collection_rate: number | null;
    tours: number;
    tours_with_gap: number;
    to_control: number;
    gaps: number;
    gap_count: number;
    cash_held: number;
  };
  series: Array<{ date: string; amount: number }>;
  drivers: Array<{ driver: string | null; driver_name: string; collected: number; gap: number; payments: number }>;
  cash_boxes: Array<{ driver: string; driver_name: string; balance: number; updated: string | null }>;
  forecast: ForecastBucket[];
}

// --- Livraison --------------------------------------------------------------------

export interface OutcomeRow {
  key: string;
  name?: string;
  closed: number;
  delivered: number;
  partial: number;
  failed: number;
  success_rate: number | null;
  first_attempt_rate: number | null;
}

export interface DriverPerformance extends OutcomeRow {
  name: string;
  days: number;
  stops_per_day: number | null;
  cash_gap: number;
}

export interface VehiclePerformance {
  vehicle: string;
  vehicle_name: string;
  stops: number;
  fuel: number;
  km: number;
  cost_per_km: number | null;
  cost_per_stop: number | null;
  maintenance: number;
}

export interface DeliveryPerformance {
  period: PilotagePeriod;
  totals: {
    closed: number;
    delivered: number;
    partial: number;
    failed: number;
    success_rate: number | null;
    first_attempt_rate: number | null;
    on_time_rate: number | null;
    lead_time: DurationStats;
  };
  reasons: Array<{ reason: string; count: number }>;
  communes: OutcomeRow[];
  drivers: DriverPerformance[];
  vehicles: VehiclePerformance[];
}

// --- Préparation & stock ----------------------------------------------------------

export interface InventoryGap {
  name: string;
  title: string;
  validated_at: string;
  lines: number;
  gap_lines: number;
  accuracy: number | null;
  surplus: number;
  shortage: number;
  net: number;
}

export interface StockOperations {
  period: PilotagePeriod;
  preparation: {
    pick_lists: number;
    completed: number;
    completion_rate: number | null;
    hours: DurationStats;
    late_orders: number;
    late_amount: number;
    picking_errors: number;
    error_rate: number | null;
  };
  shortage: { lines: number; orders: number; value: number };
  inventories: InventoryGap[];
  inventory_totals: { count: number; surplus: number; shortage: number; net: number };
  expiry: {
    buckets: { expired: number; d30: number; d60: number; d90: number };
    items: Array<{ item_code: string; item_name: string; qty: number; value: number; next_expiry: string; days: number }>;
  };
}

// --- Clients & commercial ---------------------------------------------------------

export interface CustomerAtRisk {
  customer: string;
  customer_name: string;
  orders: number;
  revenue: number;
  first_order: string;
  last_order: string;
  rhythm_days: number;
  days_silent: number;
  overdue_ratio: number;
}

export interface SalesRepPerformance {
  user: string;
  name: string;
  orders: number;
  customers: number;
  revenue: number;
  avg_order: number | null;
  discount: number;
  discount_rate: number | null;
  delivered: number;
  margin: number;
  margin_rate: number | null;
  quota_overrides: number;
}

export interface CustomerInsights {
  period: PilotagePeriod;
  at_risk: CustomerAtRisk[];
  at_risk_totals: { customers: number; revenue: number };
  origins: Array<{ origin: string; orders: number; revenue: number; order_share: number | null; revenue_share: number | null }>;
  campaigns: Array<{ campaign: string; title: string; views: number; clicks: number; add_to_cart: number; click_rate: number | null; cart_rate: number | null }>;
  sales_reps: SalesRepPerformance[];
}

// --- Objectifs --------------------------------------------------------------------

export type ObjectiveKey = "ca_ht" | "marge" | "encaissements";

export interface ObjectiveProgress {
  actual: number;
  target: number | null;
  progress: number | null;
  projection: number | null;
  projected_progress: number | null;
  /** Part du mois écoulée (0-1). */
  expected_progress: number;
}

export interface Objectives {
  month: string;
  today: string;
  targets: Record<ObjectiveKey, number | null>;
  notes: string;
  progress: Record<ObjectiveKey, ObjectiveProgress>;
  history: Array<{ month: string } & Record<ObjectiveKey, number> & Record<`${ObjectiveKey}_target`, number | null>>;
}

export type ObjectivesInput = { month: string; notes?: string } & Partial<Record<ObjectiveKey, number | null>>;

// --- Hooks ------------------------------------------------------------------------

function usePeriodCall<T>(method: string, fromDate: string, toDate: string) {
  return useFrappeGetCall<FrappeMessage<T>>(
    `${API}.${method}`,
    { from_date: fromDate, to_date: toDate },
    `pilotage-${method}-${fromDate}-${toDate}`,
    STATIC,
  );
}

export const useCashOverview = (fromDate: string, toDate: string) => usePeriodCall<CashOverview>("get_cash_overview", fromDate, toDate);
export const useDeliveryPerformance = (fromDate: string, toDate: string) =>
  usePeriodCall<DeliveryPerformance>("get_delivery_performance", fromDate, toDate);
export const useStockOperations = (fromDate: string, toDate: string) => usePeriodCall<StockOperations>("get_stock_operations", fromDate, toDate);
export const useCustomerInsights = (fromDate: string, toDate: string) => usePeriodCall<CustomerInsights>("get_customer_insights", fromDate, toDate);

export function useObjectives(month: string) {
  return useFrappeGetCall<FrappeMessage<Objectives>>(`${API}.get_objectives`, { month }, `pilotage-objectives-${month}`, STATIC);
}

export function useSaveObjectives() {
  const { call, loading } = useFrappePostCall<FrappeMessage<Objectives>>(`${API}.save_objectives`);
  return { save: (payload: ObjectivesInput) => call({ payload }).then((res) => res.message), saving: loading };
}
