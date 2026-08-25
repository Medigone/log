/** Formatage centralisé des valeurs affichées — une seule convention pour toute l'app. */

const MONEY = new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 0 });
const MONEY_PRECISE = new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 2 });
const QUANTITY = new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 3 });

/** Montant en dinars. `precise` conserve les centimes (contrôle de caisse). */
export function formatMoney(value: number, options?: { precise?: boolean }) {
  const formatter = options?.precise ? MONEY_PRECISE : MONEY;
  return `${formatter.format(value)} DZD`;
}

/** Quantité d'article, jusqu'à 3 décimales. */
export function formatQuantity(value: number) {
  return QUANTITY.format(value);
}

/** Distance en mètres → kilomètres. */
export function formatDistance(meters?: number) {
  return meters == null ? "—" : `${(meters / 1000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} km`;
}

/** Date ISO `YYYY-MM-DD…` → `JJ/MM/AAAA`. */
export function formatShortDate(value?: string) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

/** Horodatage complet, locale fr-DZ. */
export function formatDateTime(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("fr-DZ");
}

/** Extrait `HH:MM` d'un datetime Frappe. */
export function formatTime(value?: string) {
  return value?.match(/(?:T|\s)(\d{2}:\d{2})/)?.[1] || "—";
}
