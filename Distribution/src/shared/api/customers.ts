import { useFrappeFileUpload, useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";

interface FrappeMessage<T> { message: T }

const API = "log.customer_ops";

// --- Options -----------------------------------------------------------------

export const CUSTOMER_STATUSES = ["Prospect", "Actif", "Dormant", "Perdu", "Exclu"] as const;
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number];

export interface CustomerOptions {
  company: string;
  currency: string | null;
  companies: string[];
  statuses: CustomerStatus[];
  legal_forms: string[];
  customer_groups: string[];
  price_lists: string[];
  payment_terms_templates: string[];
  wilayas: string[];
  address_types: string[];
}

// --- Liste -------------------------------------------------------------------

export type CustomerListFilter = "tous" | CustomerStatus | "sans_gps" | "desactives";
export type CustomerSort = "recent" | "nom" | "creation";

export const CUSTOMER_FILTER_LABELS: Record<CustomerListFilter, string> = {
  tous: "Tous (actifs)",
  Prospect: "Prospects",
  Actif: "Actifs",
  Dormant: "Dormants",
  Perdu: "Perdus",
  Exclu: "Exclus",
  sans_gps: "Sans GPS",
  desactives: "Désactivés",
};

export const CUSTOMER_SORT_LABELS: Record<CustomerSort, string> = {
  recent: "Modifiés récemment",
  nom: "Raison sociale",
  creation: "Créés récemment",
};

export interface CustomerRow {
  name: string;
  customer_name: string;
  customer_group: string | null;
  status: CustomerStatus | null;
  disabled: boolean;
  is_frozen: boolean;
  commune: string | null;
  commune_name: string | null;
  wilaya: string | null;
  phone: string | null;
  nif: string | null;
  rc: string | null;
  default_price_list: string | null;
  payment_terms: string | null;
  has_gps: boolean;
  key_account: boolean;
  balance: number;
  last_order: string | null;
  creation: string | null;
}

export interface CustomerList {
  customers: CustomerRow[];
  total: number;
  start: number;
  limit: number;
  counts: Record<CustomerListFilter, number>;
}

export interface CustomerQuery {
  search: string;
  customerGroup: string;
  wilaya: string;
  status: CustomerListFilter;
  sort: CustomerSort;
  start: number;
  limit: number;
}

// --- Fiche -------------------------------------------------------------------

export interface CustomerContact {
  name: string;
  first_name: string;
  last_name: string;
  full_name: string;
  designation: string;
  email: string;
  phone: string;
  mobile: string;
  is_primary: boolean;
  user: string | null;
}

export interface CustomerAddress {
  name: string;
  address_title: string;
  address_type: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  pincode: string;
  country: string | null;
  phone: string;
  email: string;
  is_primary: boolean;
  is_shipping: boolean;
  disabled: boolean;
}

export interface CreditLimit {
  company: string;
  credit_limit: number;
  bypass_credit_limit_check: boolean;
}

export interface CustomerBalance {
  company: string;
  currency: string;
  amount: number;
}

export type CustomerFileKind = "rc" | "nif" | "nis" | "ai";

export interface CustomerDetail {
  name: string;
  customer_name: string;
  customer_type: string;
  customer_group: string | null;
  territory: string | null;
  status: CustomerStatus | null;
  legal_form: string | null;
  disabled: boolean;
  is_frozen: boolean;
  image: string | null;
  phone: string;
  email: string;
  main_phone: string;
  fax: string;
  main_email: string;
  main_contact_name: string;
  primary_contact: string | null;
  primary_address: string | null;
  existence_date: string | null;
  is_virtual: boolean;
  key_account: boolean;
  small_quantities: boolean;
  rc: string;
  nif: string;
  nis: string;
  ai: string;
  files: Record<CustomerFileKind, string | null>;
  commune: string | null;
  commune_name: string | null;
  wilaya: string | null;
  region: string | null;
  gps: {
    raw: string;
    latitude: number | null;
    longitude: number | null;
    precision_m: number | null;
    captured_at: string | null;
    captured_by: string | null;
    source_bl: string | null;
  };
  default_price_list: string | null;
  effective_price_list: string | null;
  payment_terms: string | null;
  credit_limits: CreditLimit[];
  quality: { client: number; frequency: number; interaction: number; payments: number; satisfaction: number };
  portal_users: string[];
  contacts: CustomerContact[];
  addresses: CustomerAddress[];
  balance: CustomerBalance[];
  creation: string | null;
  modified: string;
}

/** Champs modifiables (miroir de EDITABLE_FIELDS côté serveur). */
export interface CustomerChanges {
  customer_name?: string;
  customer_group?: string;
  status?: CustomerStatus;
  legal_form?: string;
  phone?: string;
  email?: string;
  main_phone?: string;
  fax?: string;
  main_email?: string;
  existence_date?: string | null;
  is_virtual?: boolean;
  key_account?: boolean;
  small_quantities?: boolean;
  rc?: string;
  nif?: string;
  nis?: string;
  ai?: string;
  default_price_list?: string;
  payment_terms?: string;
  disabled?: boolean;
  is_frozen?: boolean;
  quality_frequency?: number;
  quality_interaction?: number;
  quality_payments?: number;
  satisfaction?: number;
  commune?: string;
  gps?: string;
  credit_limits?: CreditLimit[];
}

export interface NewCustomerPayload extends CustomerChanges {
  customer_name: string;
  customer_group: string;
  commune: string;
}

export interface ContactInput {
  customer: string;
  name?: string;
  first_name: string;
  last_name: string;
  designation: string;
  email: string;
  phone: string;
  mobile: string;
  is_primary: boolean;
}

export interface AddressInput {
  customer: string;
  name?: string;
  address_title: string;
  address_type: string;
  address_line1: string;
  address_line2: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  email: string;
  is_primary: boolean;
  is_shipping: boolean;
}

// --- Activité ----------------------------------------------------------------

export interface CustomerActivity {
  currency: string;
  balance: CustomerBalance[];
  outstanding: { total: number; overdue: number; count: number };
  last_12_months: { orders: number; revenue: number; last_order: string | null };
  orders: Array<{
    name: string;
    date: string;
    delivery_date: string | null;
    grand_total: number;
    status: string;
    per_delivered: number;
    per_billed: number;
  }>;
  deliveries: Array<{ name: string; date: string; grand_total: number; status: string; is_return: boolean }>;
  invoices: Array<{
    name: string;
    date: string;
    due_date: string | null;
    grand_total: number;
    outstanding_amount: number;
    status: string;
    is_return: boolean;
  }>;
  payments: Array<{
    name: string;
    date: string | null;
    amount: number;
    mode: string;
    status: string;
    delivery_note: string | null;
    cheque_number: string | null;
  }>;
}

// --- Portail -----------------------------------------------------------------

export interface PortalAccessSetup {
  customer: string;
  primaryContact: string | null;
  contacts: Array<{ name: string; firstName: string; lastName: string; fullName: string; email: string; user: string | null }>;
  accesses: Array<{ user: string; fullName: string; enabled: boolean; userType: string | null }>;
}

export interface PortalUserInput {
  customer: string;
  contact?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

export interface PortalUserResult {
  status: "created" | "linked_existing" | "already_linked";
  user: string;
  email: string;
  contact: string | null;
  temporaryPassword: string | null;
  requiresPasswordChange: boolean;
}

// --- Actions groupées --------------------------------------------------------

export type BulkCustomerChanges = Partial<Pick<CustomerChanges, "status" | "customer_group" | "default_price_list" | "payment_terms" | "disabled">>;

export interface BulkCustomerResult {
  updated: string[];
  errors: Array<{ name: string; error: string }>;
}

// --- Hooks de lecture --------------------------------------------------------

export function useCustomerOptions() {
  return useFrappeGetCall<FrappeMessage<CustomerOptions>>(`${API}.get_customer_options`, {}, "distribution-customer-options", {
    revalidateOnFocus: false,
  });
}

export function customerQueryParams(query: Omit<CustomerQuery, "start" | "limit">) {
  return {
    search: query.search,
    customer_group: query.customerGroup,
    wilaya: query.wilaya,
    status: query.status,
    sort: query.sort,
  };
}

export function useCustomers(query: CustomerQuery) {
  const params = { ...customerQueryParams(query), start: query.start, limit: query.limit };
  return useFrappeGetCall<FrappeMessage<CustomerList>>(
    `${API}.list_customers`,
    params,
    `distribution-customers-${JSON.stringify(params)}`,
    { keepPreviousData: true },
  );
}

export function useCustomer(name?: string) {
  return useFrappeGetCall<FrappeMessage<CustomerDetail>>(
    `${API}.get_customer`,
    name ? { name } : undefined,
    name ? `distribution-customer-${name}` : null,
    { revalidateOnFocus: false },
  );
}

export function useCustomerActivity(name: string | undefined, enabled: boolean) {
  return useFrappeGetCall<FrappeMessage<CustomerActivity>>(
    `${API}.get_customer_activity`,
    name ? { name } : undefined,
    name && enabled ? `distribution-customer-activity-${name}` : null,
    { revalidateOnFocus: false },
  );
}

export function usePortalAccess(name: string | undefined, enabled: boolean) {
  return useFrappeGetCall<FrappeMessage<PortalAccessSetup>>(
    `${API}.get_portal_access`,
    name ? { name } : undefined,
    name && enabled ? `distribution-customer-portal-${name}` : null,
    { revalidateOnFocus: false },
  );
}

// --- Écritures ---------------------------------------------------------------

export function useCustomerMutations() {
  const create = useFrappePostCall<FrappeMessage<CustomerDetail>>(`${API}.create_customer`);
  const update = useFrappePostCall<FrappeMessage<CustomerDetail>>(`${API}.update_customer`);
  const file = useFrappePostCall<FrappeMessage<CustomerDetail>>(`${API}.set_customer_file`);
  const contact = useFrappePostCall<FrappeMessage<CustomerDetail>>(`${API}.save_contact`);
  const removeContact = useFrappePostCall<FrappeMessage<CustomerDetail>>(`${API}.delete_contact`);
  const address = useFrappePostCall<FrappeMessage<CustomerDetail>>(`${API}.save_address`);
  const removeAddress = useFrappePostCall<FrappeMessage<CustomerDetail>>(`${API}.delete_address`);
  const bulk = useFrappePostCall<FrappeMessage<BulkCustomerResult>>(`${API}.bulk_update_customers`);
  const exporter = useFrappePostCall<FrappeMessage<{ customers: CustomerRow[]; total: number; truncated: boolean }>>(
    `${API}.export_customers`,
  );
  const portal = useFrappePostCall<FrappeMessage<PortalUserResult>>(`${API}.create_portal_user`);
  const { upload, loading: uploading } = useFrappeFileUpload();

  return {
    createCustomer: async (payload: NewCustomerPayload) => (await create.call({ payload })).message,
    updateCustomer: async (name: string, changes: CustomerChanges) => (await update.call({ payload: { name, ...changes } })).message,
    uploadFile: async (name: string, kind: CustomerFileKind, upload_file: File) => {
      const uploaded = await upload(upload_file, { isPrivate: true });
      return (await file.call({ name, kind, file_url: uploaded.file_url })).message;
    },
    removeFile: async (name: string, kind: CustomerFileKind) => (await file.call({ name, kind, file_url: "" })).message,
    saveContact: async (payload: ContactInput) => (await contact.call({ payload })).message,
    deleteContact: async (customer: string, name: string) => (await removeContact.call({ customer, name })).message,
    saveAddress: async (payload: AddressInput) => (await address.call({ payload })).message,
    deleteAddress: async (customer: string, name: string) => (await removeAddress.call({ customer, name })).message,
    bulkUpdate: async (names: string[], changes: BulkCustomerChanges) => (await bulk.call({ payload: { names, changes } })).message,
    exportCustomers: async (query: Omit<CustomerQuery, "start" | "limit">) => (await exporter.call(customerQueryParams(query))).message,
    createPortalUser: async (payload: PortalUserInput) => (await portal.call({ payload })).message,
    updating: update.loading,
    uploading: uploading || file.loading,
    bulkUpdating: bulk.loading,
    exporting: exporter.loading,
  };
}
