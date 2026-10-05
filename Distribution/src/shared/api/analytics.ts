import { useFrappeGetCall } from "frappe-react-sdk";

interface FrappeMessage<T> { message: T }

const API = "log.item_analytics_ops";

export type Quadrant = "star" | "locomotive" | "pepite" | "poids_mort";
export type AbcClass = "A" | "B" | "C";
export type AnalyticsAlertCode =
  | "negative_margin"
  | "price_below_cost"
  | "dormant"
  | "expiry"
  | "low_cover"
  | "overstock"
  | "discount"
  | "estimated_cost";

export interface AnalyticsAlert {
  code: AnalyticsAlertCode;
  tone: "danger" | "warning" | "info" | "neutral";
  /** Montant en jeu (DA) : perte, stock immobilisé ou marge menacée. */
  impact: number;
  /** Mesure affichée : jours, taux ou date selon l'alerte. */
  value: number | string | null;
}

export interface ItemAnalyticsRow {
  item_code: string;
  item_name: string;
  item_group: string | null;
  brand: string | null;
  stock_uom: string | null;
  disabled: boolean;
  qty: number;
  revenue: number;
  cost: number;
  margin: number;
  /** Marge / CA (taux de marque). */
  margin_rate: number | null;
  /** Marge / coût (taux de marge, comme le catalogue). */
  markup: number | null;
  cost_estimated: boolean;
  customers: number;
  deliveries: number;
  avg_price: number | null;
  list_price: number | null;
  buying_price: number | null;
  unit_cost: number | null;
  discount: number | null;
  discount_loss: number;
  stock_qty: number;
  stock_value: number;
  cover_days: number | null;
  rotation: number | null;
  gmroi: number | null;
  last_sale: string | null;
  days_since_last_sale: number | null;
  expiring_qty: number;
  expiring_value: number;
  next_expiry: string | null;
  prev_revenue: number;
  prev_margin: number;
  revenue_delta: number | null;
  margin_delta: number | null;
  margin_share: number | null;
  abc: AbcClass | null;
  quadrant: Quadrant | null;
  alerts: AnalyticsAlert[];
  impact: number;
}

export interface AnalyticsPeriod {
  from_date: string;
  to_date: string;
  days?: number;
}

export interface ItemAnalyticsTotals {
  revenue: number;
  cost: number;
  margin: number;
  margin_rate: number | null;
  markup: number | null;
  stock_value: number;
  rotation: number | null;
  gmroi: number | null;
  prev_revenue: number;
  prev_margin: number;
  revenue_delta: number | null;
  margin_delta: number | null;
  items_sold: number;
  items_in_stock: number;
  items_with_alerts: number;
}

export interface QuadrantSummary {
  count: number;
  revenue: number;
  margin: number;
  stock_value: number;
}

export interface ItemAnalyticsData {
  period: AnalyticsPeriod & { days: number };
  previous_period: AnalyticsPeriod;
  customer: string | null;
  thresholds: {
    dormant_days: number;
    low_cover_days: number;
    overstock_days: number;
    expiry_days: number;
    matrix: { margin_rate: number | null; cover_days: number | null };
  };
  totals: ItemAnalyticsTotals;
  opportunities: Record<Exclude<AnalyticsAlertCode, "estimated_cost">, { amount: number; count: number }>;
  quadrants: Record<Quadrant, QuadrantSummary>;
  items: ItemAnalyticsRow[];
  filters: {
    item_groups: string[];
    brands: string[];
    customers: Array<{ value: string; label: string }>;
  };
}

export interface CustomerAnalyticsRow {
  customer: string;
  customer_name: string;
  revenue: number;
  cost: number;
  margin: number;
  margin_rate: number | null;
  margin_share: number | null;
  abc: AbcClass | null;
  items: number;
  deliveries: number;
  avg_basket: number | null;
  last_purchase: string | null;
  days_since_last_purchase: number | null;
  prev_revenue: number;
  prev_margin: number;
  revenue_delta: number | null;
  margin_delta: number | null;
  top_items: Array<{ item_code: string; item_name: string; revenue: number; margin: number }>;
}

export interface CustomerAnalyticsData {
  period: AnalyticsPeriod & { days: number };
  previous_period: AnalyticsPeriod;
  totals: { customers: number; revenue: number; margin: number; margin_rate: number | null; losing_customers: number };
  customers: CustomerAnalyticsRow[];
}

export interface ItemAnalyticsDetail {
  item_code: string;
  stock_uom: string | null;
  unit_cost: number;
  list_price: number | null;
  buying_price: number | null;
  series: Array<{ month: string; qty: number; revenue: number; margin: number }>;
  customers: Array<{ customer: string; customer_name: string; qty: number; revenue: number; margin: number; margin_rate: number | null }>;
  customer_count: number;
  warehouses: Array<{ warehouse: string; qty: number; value: number }>;
  batches: Array<{ batch_no: string; qty: number; expiry_date: string | null }>;
}

export interface AnalyticsQuery {
  fromDate: string;
  toDate: string;
  itemGroup?: string;
  brand?: string;
  customer?: string;
}

const STATIC = { revalidateOnFocus: false, revalidateIfStale: false, keepPreviousData: true } as const;

export function useItemAnalytics({ fromDate, toDate, itemGroup = "", brand = "", customer = "" }: AnalyticsQuery) {
  return useFrappeGetCall<FrappeMessage<ItemAnalyticsData>>(
    `${API}.get_item_analytics`,
    { from_date: fromDate, to_date: toDate, item_group: itemGroup, brand, customer },
    `item-analytics-${fromDate}-${toDate}-${itemGroup}-${brand}-${customer}`,
    STATIC,
  );
}

export function useCustomerAnalytics({ fromDate, toDate, itemGroup = "", brand = "" }: AnalyticsQuery, enabled = true) {
  return useFrappeGetCall<FrappeMessage<CustomerAnalyticsData>>(
    `${API}.get_customer_analytics`,
    { from_date: fromDate, to_date: toDate, item_group: itemGroup, brand },
    enabled ? `customer-analytics-${fromDate}-${toDate}-${itemGroup}-${brand}` : null,
    STATIC,
  );
}

export function useItemAnalyticsDetail(itemCode: string, fromDate: string, toDate: string) {
  return useFrappeGetCall<FrappeMessage<ItemAnalyticsDetail>>(
    `${API}.get_item_analytics_detail`,
    { item_code: itemCode, from_date: fromDate, to_date: toDate },
    `item-analytics-detail-${itemCode}-${fromDate}-${toDate}`,
    STATIC,
  );
}
