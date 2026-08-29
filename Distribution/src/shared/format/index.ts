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

/** Date ISO locale → `31 août 2026`. */
export function formatLongDate(value?: string) {
  const parts = parseIsoDate(value);
  if (!parts) return value ? value : "—";
  return new Date(parts.year, parts.month - 1, parts.day).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function parseIsoDate(value?: string) {
  if (!value) return null;
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (!year || !month || !day) return null;
  return { year, month, day };
}

/** Nombre de jours calendaires entre aujourd’hui et une date ISO (négatif si passé). */
export function calendarDaysUntil(value: string, todayValue?: string) {
  const target = parseIsoDate(value);
  const today = parseIsoDate(todayValue) ?? parseIsoDate(new Date().toLocaleDateString("en-CA"));
  if (!target || !today) return null;
  const start = Date.UTC(today.year, today.month - 1, today.day);
  const end = Date.UTC(target.year, target.month - 1, target.day);
  return Math.round((end - start) / 86_400_000);
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
