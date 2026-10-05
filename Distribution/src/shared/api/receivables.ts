import { useFrappeGetCall } from "frappe-react-sdk";

interface FrappeMessage<T> { message: T }

export type ReceivableBucket = "not_due" | "d30" | "d60" | "d90" | "d90_plus";

export interface ReceivableCustomer extends Record<ReceivableBucket, number> {
  customer: string;
  customer_name: string;
  customer_group: string | null;
  wilaya: string | null;
  invoices: number;
  /** Restes à payer des factures. */
  gross: number;
  /** Avoirs et avances non imputés. */
  credits: number;
  net: number;
  overdue: number;
  due_soon: number;
  oldest_due_date: string | null;
  max_days_overdue: number;
  credit_limit: number | null;
  over_limit: boolean;
  last_payment: string | null;
}

export interface ReceivablesData {
  as_of: string;
  soon_days: number;
  totals: {
    gross: number;
    credits: number;
    net: number;
    overdue: number;
    /** Part échue de la créance (ratio 0–1). */
    overdue_share: number | null;
    due_soon: number;
    d90_plus: number;
    buckets: Record<ReceivableBucket, number>;
    customers: number;
    overdue_customers: number;
    due_soon_customers: number;
    d90_customers: number;
    over_limit_customers: number;
    invoices: number;
  };
  customers: ReceivableCustomer[];
}

/** Créances au jour : indépendantes de la période analysée. */
export function useReceivables() {
  return useFrappeGetCall<FrappeMessage<ReceivablesData>>("log.receivables_ops.get_receivables", {}, "receivables", {
    revalidateOnFocus: false,
    keepPreviousData: true,
  });
}
