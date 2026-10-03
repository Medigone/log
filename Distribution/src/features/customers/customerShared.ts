import type { StatusTone } from "@/shared/design/statusTone";
import type { BulkCustomerChanges, CustomerChanges, CustomerDetail, CustomerRow, CustomerStatus } from "@/shared/api/customers";
import type { CustomerSummary } from "@/shared/api/orders";

export const CUSTOMER_PAGE_SIZE = 25;

export const STATUS_TONES: Record<CustomerStatus, StatusTone> = {
  Prospect: "info",
  Actif: "success",
  Dormant: "warning",
  Perdu: "neutral",
  Exclu: "danger",
};

export function statusTone(status: CustomerStatus | null | undefined): StatusTone {
  return status ? STATUS_TONES[status] : "neutral";
}

/**
 * Ne garde que les champs réellement modifiés par rapport à la fiche,
 * pour que l'enregistrement d'un onglet n'écrase pas les autres.
 */
export function changedFields<T extends Partial<CustomerChanges>>(initial: T, current: T): Partial<T> {
  const changes: Partial<T> = {};
  for (const key of Object.keys(current) as Array<keyof T>) {
    const before = initial[key] ?? "";
    const after = current[key] ?? "";
    if (JSON.stringify(before) !== JSON.stringify(after)) changes[key] = current[key];
  }
  return changes;
}

/** « 35.69, -0.63 » → coordonnées, ou null si invalide (même règle que parse_gps_value côté serveur). */
export function parseGps(value: string): { latitude: number; longitude: number } | null {
  const numbers = value.match(/-?\d+(?:\.\d+)?/g);
  if (!numbers || numbers.length < 2) return null;
  const latitude = Number(numbers[0]);
  const longitude = Number(numbers[1]);
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;
  if (latitude === 0 && longitude === 0) return null;
  return { latitude, longitude };
}

export function formatGps(latitude: number, longitude: number) {
  return `${latitude.toFixed(6)},${longitude.toFixed(6)}`;
}

export function mapsUrl(latitude: number, longitude: number) {
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const CSV_COLUMNS: Array<[string, (row: CustomerRow) => unknown]> = [
  ["Code", (row) => row.name],
  ["Raison sociale", (row) => row.customer_name],
  ["Catégorie", (row) => row.customer_group],
  ["Statut", (row) => (row.disabled ? "Désactivé" : row.status)],
  ["Commune", (row) => row.commune_name],
  ["Wilaya", (row) => row.wilaya],
  ["Téléphone", (row) => row.phone],
  ["NIF", (row) => row.nif],
  ["RC", (row) => row.rc],
  ["Liste de prix", (row) => row.default_price_list],
  ["Conditions de paiement", (row) => row.payment_terms],
  ["GPS", (row) => (row.has_gps ? "Oui" : "Non")],
  ["Grand compte", (row) => (row.key_account ? "Oui" : "Non")],
  ["Solde", (row) => row.balance.toFixed(2)],
  ["Dernière commande", (row) => row.last_order],
];

/** CSV « ; » + BOM : s'ouvre directement dans Excel en français. */
export function customersToCsv(rows: readonly CustomerRow[]) {
  const lines = [CSV_COLUMNS.map(([label]) => label).join(";")];
  for (const row of rows) lines.push(CSV_COLUMNS.map(([, value]) => csvCell(value(row))).join(";"));
  return "\uFEFF" + lines.join("\r\n");
}

export function downloadText(filename: string, content: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export type SaveCustomer = (changes: CustomerChanges, message?: string) => Promise<CustomerDetail>;

export const ADDRESS_TYPE_LABELS: Record<string, string> = {
  Shipping: "Livraison",
  Billing: "Facturation",
  Office: "Bureau",
  Warehouse: "Entrepôt",
  Shop: "Magasin",
  Other: "Autre",
};

export const BULK_KEEP = "";
export const BULK_CLEAR = "__clear__";

/** Valeur d'un sélecteur groupé : BULK_KEEP = ne pas modifier, BULK_CLEAR = vider le champ. */
export function bulkChanges(values: {
  status: string;
  customerGroup: string;
  priceList: string;
  paymentTerms: string;
  activity: string;
}): BulkCustomerChanges {
  const changes: BulkCustomerChanges = {};
  if (values.status) changes.status = values.status as CustomerStatus;
  if (values.customerGroup) changes.customer_group = values.customerGroup;
  if (values.priceList) changes.default_price_list = values.priceList === BULK_CLEAR ? "" : values.priceList;
  if (values.paymentTerms) changes.payment_terms = values.paymentTerms === BULK_CLEAR ? "" : values.paymentTerms;
  if (values.activity) changes.disabled = values.activity === "disable";
  return changes;
}

/** Résumé attendu par la saisie de commande (pré-sélection du client). */
export function toCustomerSummary(customer: CustomerDetail): CustomerSummary {
  return {
    name: customer.name,
    customer_name: customer.customer_name,
    customer_group: customer.customer_group,
    commune: customer.commune,
    commune_name: customer.commune_name,
    wilaya: customer.wilaya,
    phone: customer.phone || null,
    default_price_list: customer.default_price_list,
    payment_terms: customer.payment_terms,
    has_gps: customer.gps.latitude != null,
    status: customer.status,
  };
}
