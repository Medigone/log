import { useFrappeFileUpload, useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";

interface FrappeMessage<T> { message: T }

const API = "log.catalog_ops";

// --- Options -----------------------------------------------------------------

export interface CatalogItemGroup {
  name: string;
  parent: string | null;
  is_group: boolean;
  item_count: number;
}

export interface CatalogPriceList {
  name: string;
  currency: string | null;
  selling: boolean;
  buying: boolean;
  enabled: boolean;
  item_count?: number;
}

export interface CatalogOptions {
  company: string | null;
  currency: string | null;
  item_groups: CatalogItemGroup[];
  brands: string[];
  uoms: string[];
  default_uom: string;
  price_lists: CatalogPriceList[];
  selling_price_list: string | null;
  buying_price_list: string | null;
  item_tax_templates: Array<{ name: string; title: string }>;
  warehouses: string[];
  customer_groups: string[];
}

// --- Articles ----------------------------------------------------------------

export type CatalogItemStatus = "tous" | "actifs" | "desactives" | "sans_prix" | "hors_store";

export const ITEM_STATUS_LABELS: Record<CatalogItemStatus, string> = {
  tous: "Tous",
  actifs: "Actifs",
  desactives: "Désactivés",
  sans_prix: "Sans prix de vente",
  hors_store: "Masqués du Store",
};

export interface CatalogItemRow {
  item_code: string;
  item_name: string;
  item_group: string | null;
  brand: string | null;
  stock_uom: string;
  image: string | null;
  disabled: boolean;
  show_in_store: boolean;
  ppa: number;
  selling_rate: number | null;
  buying_rate: number | null;
  stock_qty: number;
}

export interface CatalogItemCounts {
  actifs: number;
  desactives: number;
  sans_prix: number;
  hors_store: number;
}

export interface CatalogItemList {
  items: CatalogItemRow[];
  total: number;
  start: number;
  limit: number;
  counts: CatalogItemCounts;
  selling_price_list: string | null;
  buying_price_list: string | null;
}

export interface ItemBarcode {
  barcode: string;
  barcode_type?: string;
  uom: string | null;
}

export interface ItemUom {
  uom: string;
  conversion_factor: number;
}

export interface ItemStockRow {
  warehouse: string;
  actual_qty: number;
  reserved_qty: number;
  available_qty: number;
  projected_qty: number;
}

export interface CatalogItem {
  item_code: string;
  item_name: string;
  description: string;
  item_group: string | null;
  brand: string | null;
  stock_uom: string;
  image: string | null;
  disabled: boolean;
  is_stock_item: boolean;
  has_batch_no: boolean;
  ppa: number;
  show_in_store: boolean;
  show_price_in_store: boolean;
  barcodes: ItemBarcode[];
  uoms: ItemUom[];
  taxes: Array<{ item_tax_template: string }>;
  has_stock_moves: boolean;
  stock: ItemStockRow[];
  selling_price_list: string | null;
  buying_price_list: string | null;
  selling_rate: number | null;
  buying_rate: number | null;
  modified: string;
}

export interface NewCatalogItemInput {
  item_code?: string;
  item_name: string;
  item_group: string;
  brand?: string;
  stock_uom: string;
  description?: string;
  has_batch_no: boolean;
  barcodes: Array<{ barcode: string }>;
  buying_rate: number | null;
  selling_rate: number | null;
  ppa: number | null;
  show_in_store: boolean;
}

export type CatalogItemUpdate = { item_code: string } & Partial<{
  item_name: string;
  description: string;
  item_group: string;
  brand: string | null;
  stock_uom: string;
  has_batch_no: boolean;
  disabled: boolean;
  image: string | null;
  ppa: number;
  show_in_store: boolean;
  show_price_in_store: boolean;
  barcodes: Array<{ barcode: string; uom: string | null }>;
  uoms: ItemUom[];
  taxes: Array<{ item_tax_template: string }>;
}>;

// --- Prix --------------------------------------------------------------------

export interface ItemPrice {
  name: string;
  item_code: string;
  price_list: string;
  selling: boolean;
  buying: boolean;
  customer: string | null;
  customer_name: string | null;
  uom: string;
  rate: number;
  currency: string | null;
  valid_from: string | null;
  valid_upto: string | null;
}

export interface ItemPriceInput {
  name?: string | null;
  item_code: string;
  price_list: string;
  rate: number;
  customer?: string | null;
  valid_from?: string | null;
  valid_upto?: string | null;
}

export interface ItemPrices {
  item_code: string;
  stock_uom: string;
  ppa: number;
  prices: ItemPrice[];
  pricing_rules: PricingRule[];
}

export interface CustomerOption {
  name: string;
  customer_name: string;
  customer_group: string | null;
}

export interface PriceGridRow {
  item_code: string;
  item_name: string;
  item_group: string | null;
  brand: string | null;
  stock_uom: string;
  ppa: number;
  buying_rate: number | null;
  price_name: string | null;
  rate: number | null;
}

export interface PriceGrid {
  price_list: string;
  items: PriceGridRow[];
  total: number;
  start: number;
  limit: number;
}

export type BulkOperation = "percent" | "amount" | "fixed" | "from_buying";

export const BULK_OPERATION_LABELS: Record<BulkOperation, string> = {
  percent: "Augmenter / baisser de x %",
  amount: "Ajouter / retirer un montant",
  fixed: "Fixer un prix unique",
  from_buying: "Prix d’achat + marge de x %",
};

export interface BulkPriceInput {
  price_list: string;
  operation: BulkOperation;
  value: number;
  item_group?: string;
  brand?: string;
  round_to?: number;
  dry_run: boolean;
}

export interface BulkPriceResult {
  count: number;
  applied: boolean;
  changes: Array<{ item_code: string; item_name: string; old_rate: number | null; new_rate: number }>;
}

export interface PriceListInput {
  name?: string;
  price_list_name: string;
  selling: boolean;
  buying: boolean;
  enabled: boolean;
  currency?: string;
}

// --- Promotions --------------------------------------------------------------

export type PricingRuleState = "active" | "a_venir" | "expiree" | "desactivee";
export type PricingRuleApplyOn = "Item Code" | "Item Group" | "Brand";
export type PricingRuleType = "Discount Percentage" | "Discount Amount" | "Rate";
export type PricingRuleTarget = "" | "Customer" | "Customer Group";

export const RULE_STATE_LABELS: Record<PricingRuleState, string> = {
  active: "Active",
  a_venir: "À venir",
  expiree: "Expirée",
  desactivee: "Désactivée",
};

export const RULE_APPLY_ON_LABELS: Record<PricingRuleApplyOn, string> = {
  "Item Code": "Articles",
  "Item Group": "Groupes d’articles",
  Brand: "Marques",
};

export const RULE_TYPE_LABELS: Record<PricingRuleType, string> = {
  "Discount Percentage": "Remise en %",
  "Discount Amount": "Remise en DZD",
  Rate: "Prix promotionnel",
};

export const RULE_TARGET_LABELS: Record<PricingRuleTarget, string> = {
  "": "Tous les clients",
  Customer: "Un client",
  "Customer Group": "Un groupe de clients",
};

export interface PricingRule {
  name: string;
  title: string;
  apply_on: string;
  targets: string[];
  rate_or_discount: PricingRuleType;
  discount_percentage: number;
  discount_amount: number;
  rate: number;
  min_qty: number;
  valid_from: string | null;
  valid_upto: string | null;
  applicable_for: string;
  party: string | null;
  for_price_list: string | null;
  priority: number | null;
  disabled: boolean;
  state: PricingRuleState;
  editable: boolean;
}

export interface PricingRuleInput {
  name?: string;
  title: string;
  apply_on: PricingRuleApplyOn;
  targets: string[];
  rate_or_discount: PricingRuleType;
  value: number;
  min_qty: number;
  valid_from: string | null;
  valid_upto: string | null;
  applicable_for: PricingRuleTarget;
  party: string | null;
  for_price_list: string | null;
  priority: number | null;
  disabled: boolean;
}

export function ruleValue(rule: Pick<PricingRule, "rate_or_discount" | "discount_percentage" | "discount_amount" | "rate">) {
  if (rule.rate_or_discount === "Discount Percentage") return rule.discount_percentage;
  if (rule.rate_or_discount === "Discount Amount") return rule.discount_amount;
  return rule.rate;
}

// --- Référentiels ------------------------------------------------------------

export interface BrandRow {
  name: string;
  item_count: number;
}

export interface StoreSettings {
  store_groups: string[];
  effective_store_groups: string[];
  featured_groups: string[];
  rail_limit: number;
  show_categories: boolean;
  show_promotions: boolean;
  show_featured: boolean;
  leaf_groups: string[];
}

// --- Hooks de lecture --------------------------------------------------------

export interface CatalogItemQuery {
  search: string;
  itemGroup: string;
  brand: string;
  status: CatalogItemStatus;
  start: number;
  limit: number;
}

export function useCatalogOptions() {
  return useFrappeGetCall<FrappeMessage<CatalogOptions>>(`${API}.get_catalog_options`, {}, "distribution-catalog-options", {
    revalidateOnFocus: false,
  });
}

export function useCatalogItems(query: CatalogItemQuery) {
  const params = {
    search: query.search,
    item_group: query.itemGroup,
    brand: query.brand,
    status: query.status,
    start: query.start,
    limit: query.limit,
  };
  return useFrappeGetCall<FrappeMessage<CatalogItemList>>(
    `${API}.list_items`,
    params,
    `distribution-catalog-items-${JSON.stringify(params)}`,
    { keepPreviousData: true },
  );
}

export function useCatalogItem(itemCode?: string) {
  return useFrappeGetCall<FrappeMessage<CatalogItem>>(
    `${API}.get_item`,
    itemCode ? { item_code: itemCode } : undefined,
    itemCode ? `distribution-catalog-item-${itemCode}` : null,
    { revalidateOnFocus: false },
  );
}

export function useItemPrices(itemCode?: string) {
  return useFrappeGetCall<FrappeMessage<ItemPrices>>(
    `${API}.get_item_prices`,
    itemCode ? { item_code: itemCode } : undefined,
    itemCode ? `distribution-catalog-item-prices-${itemCode}` : null,
    { revalidateOnFocus: false },
  );
}

export function usePriceLists() {
  return useFrappeGetCall<FrappeMessage<CatalogPriceList[]>>(`${API}.list_price_lists`, {}, "distribution-catalog-price-lists", {
    revalidateOnFocus: false,
  });
}

export function usePriceGrid(priceList: string, query: Omit<CatalogItemQuery, "status">) {
  const params = {
    price_list: priceList,
    search: query.search,
    item_group: query.itemGroup,
    brand: query.brand,
    start: query.start,
    limit: query.limit,
  };
  return useFrappeGetCall<FrappeMessage<PriceGrid>>(
    `${API}.get_price_grid`,
    priceList ? params : undefined,
    priceList ? `distribution-catalog-price-grid-${JSON.stringify(params)}` : null,
    { keepPreviousData: true, revalidateOnFocus: false },
  );
}

export function usePricingRules(state: PricingRuleState | "", search: string) {
  const params = { state, search };
  return useFrappeGetCall<FrappeMessage<{ rules: PricingRule[]; counts: Partial<Record<PricingRuleState, number>> }>>(
    `${API}.list_pricing_rules`,
    params,
    `distribution-catalog-rules-${JSON.stringify(params)}`,
    { keepPreviousData: true },
  );
}

export function useBrands() {
  return useFrappeGetCall<FrappeMessage<BrandRow[]>>(`${API}.list_brands`, {}, "distribution-catalog-brands", {
    revalidateOnFocus: false,
  });
}

export function useStoreSettings() {
  return useFrappeGetCall<FrappeMessage<StoreSettings>>(`${API}.get_store_settings`, {}, "distribution-catalog-store", {
    revalidateOnFocus: false,
  });
}

// --- Écritures ---------------------------------------------------------------

export function useCatalogMutations() {
  const create = useFrappePostCall<FrappeMessage<CatalogItem>>(`${API}.create_item`);
  const update = useFrappePostCall<FrappeMessage<CatalogItem>>(`${API}.update_item`);
  const image = useFrappePostCall<FrappeMessage<{ item_code: string; image: string | null }>>(`${API}.set_item_image`);
  const savePrice = useFrappePostCall<FrappeMessage<ItemPrice>>(`${API}.save_item_price`);
  const deletePrice = useFrappePostCall<FrappeMessage<{ deleted: string }>>(`${API}.delete_item_price`);
  const savePpa = useFrappePostCall<FrappeMessage<{ item_code: string; ppa: number }>>(`${API}.save_item_ppa`);
  const gridPrice = useFrappePostCall<FrappeMessage<{ item_code: string; price_name: string; rate: number }>>(
    `${API}.set_grid_price`,
  );
  const bulk = useFrappePostCall<FrappeMessage<BulkPriceResult>>(`${API}.bulk_update_prices`);
  const priceList = useFrappePostCall<FrappeMessage<CatalogPriceList>>(`${API}.save_price_list`);
  const customers = useFrappePostCall<FrappeMessage<CustomerOption[]>>(`${API}.search_customers`);
  const rule = useFrappePostCall<FrappeMessage<PricingRule>>(`${API}.save_pricing_rule`);
  const ruleDisabled = useFrappePostCall<FrappeMessage<PricingRule>>(`${API}.set_pricing_rule_disabled`);
  const group = useFrappePostCall<FrappeMessage<{ item_groups: CatalogItemGroup[]; name: string }>>(`${API}.save_item_group`);
  const brand = useFrappePostCall<FrappeMessage<{ brands: BrandRow[]; name: string }>>(`${API}.save_brand`);
  const store = useFrappePostCall<FrappeMessage<StoreSettings>>(`${API}.save_store_settings`);
  const { upload, loading: uploading } = useFrappeFileUpload();

  return {
    createItem: async (payload: NewCatalogItemInput) => (await create.call({ payload })).message,
    updateItem: async (payload: CatalogItemUpdate) => (await update.call({ payload })).message,
    uploadImage: async (itemCode: string, file: File) => {
      const uploaded = await upload(file, { isPrivate: false, doctype: "Item", docname: itemCode, fieldname: "image" });
      return (await image.call({ item_code: itemCode, file_url: uploaded.file_url })).message;
    },
    removeImage: async (itemCode: string) => (await image.call({ item_code: itemCode, file_url: "" })).message,
    saveItemPrice: async (payload: ItemPriceInput) => (await savePrice.call({ payload })).message,
    deleteItemPrice: async (name: string) => (await deletePrice.call({ name })).message,
    saveItemPpa: async (itemCode: string, ppa: number) => (await savePpa.call({ item_code: itemCode, ppa })).message,
    setGridPrice: async (priceList: string, itemCode: string, rate: number) =>
      (await gridPrice.call({ price_list: priceList, item_code: itemCode, rate })).message,
    bulkUpdatePrices: async (payload: BulkPriceInput) => (await bulk.call({ payload })).message,
    savePriceList: async (payload: PriceListInput) => (await priceList.call({ payload })).message,
    searchCustomers: async (txt: string) => (await customers.call({ txt })).message,
    savePricingRule: async (payload: PricingRuleInput) => (await rule.call({ payload })).message,
    setPricingRuleDisabled: async (name: string, disabled: boolean) =>
      (await ruleDisabled.call({ name, disabled: disabled ? 1 : 0 })).message,
    saveItemGroup: async (payload: { name?: string; item_group_name: string; parent: string; is_group: boolean }) =>
      (await group.call({ payload })).message,
    saveBrand: async (payload: { name?: string; brand: string }) => (await brand.call({ payload })).message,
    saveStoreSettings: async (payload: Partial<StoreSettings>) => (await store.call({ payload })).message,
    creating: create.loading,
    updating: update.loading,
    uploading: uploading || image.loading,
    bulkUpdating: bulk.loading,
  };
}
