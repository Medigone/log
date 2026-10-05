import type { StatusTone } from "@/shared/design/statusTone";
import type { AbcClass, AnalyticsAlert, AnalyticsAlertCode, ItemAnalyticsRow, Quadrant } from "@/shared/api/analytics";
import { formatMoney, formatShortDate } from "@/shared/format";

const PERCENT = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const RATIO = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });

/** 0.123 → « 12,3 % ». */
export function formatPercent(value: number | null | undefined) {
  return value == null ? "—" : `${PERCENT.format(value * 100)} %`;
}

/** Variation signée : 0.12 → « +12 % ». */
export function formatDelta(value: number | null | undefined) {
  if (value == null) return null;
  const rounded = Math.round(value * 100);
  return `${rounded > 0 ? "+" : ""}${rounded} %`;
}

export function formatRatio(value: number | null | undefined) {
  return value == null ? "—" : RATIO.format(value);
}

export function formatDays(value: number | null | undefined) {
  if (value == null) return "—";
  return value > 999 ? "> 999 j" : `${Math.round(value)} j`;
}

export function deltaTone(value: number | null | undefined): StatusTone {
  if (value == null || Math.abs(value) < 0.005) return "neutral";
  return value > 0 ? "success" : "danger";
}

export const QUADRANTS: Record<Quadrant, { label: string; axes: string; action: string; tone: StatusTone }> = {
  star: { label: "Stars", axes: "Marge forte · rotation rapide", action: "Protéger : ne jamais tomber en rupture", tone: "success" },
  locomotive: { label: "Locomotives", axes: "Rotation rapide · marge faible", action: "Revoir le prix ou négocier l’achat", tone: "warning" },
  pepite: { label: "Pépites", axes: "Marge forte · rotation lente", action: "Pousser : promo, commerciaux, Store", tone: "info" },
  poids_mort: { label: "Poids morts", axes: "Marge faible · rotation lente", action: "Déstocker ou déréférencer", tone: "danger" },
};

/** Ordre d'affichage de la matrice : ligne du haut = marge forte. */
export const QUADRANT_ORDER: Quadrant[] = ["pepite", "star", "poids_mort", "locomotive"];

export const ABC_HINTS: Record<AbcClass, string> = {
  A: "80 % de la marge",
  B: "15 % suivants",
  C: "5 % restants",
};

export const ALERT_LABELS: Record<AnalyticsAlertCode, string> = {
  negative_margin: "Vendu à perte",
  price_below_cost: "Tarif sous le coût",
  dormant: "Stock dormant",
  expiry: "Péremption proche",
  low_cover: "Rupture proche",
  overstock: "Surstock",
  discount: "Remises élevées",
  estimated_cost: "Coût estimé",
};

/** Libellés du bandeau « gisements de profit », par ordre d'importance. */
export const OPPORTUNITIES: Array<{ code: Exclude<AnalyticsAlertCode, "estimated_cost">; label: string; hint: string }> = [
  { code: "dormant", label: "Stock dormant", hint: "trésorerie à libérer" },
  { code: "overstock", label: "Surstock", hint: "excédent au-delà de la couverture cible" },
  { code: "expiry", label: "Lots à écouler", hint: "avant leur date de péremption" },
  { code: "negative_margin", label: "Ventes à perte", hint: "perte sur la période" },
  { code: "discount", label: "Remises", hint: "marge cédée sous le tarif" },
  { code: "price_below_cost", label: "Tarifs sous le coût", hint: "perte estimée par mois" },
  { code: "low_cover", label: "Ruptures proches", hint: "marge mensuelle menacée" },
];

/** Phrase courte expliquant une alerte, avec sa mesure. */
export function alertDetail(alert: AnalyticsAlert): string {
  const value = alert.value;
  switch (alert.code) {
    case "negative_margin":
      return `${formatMoney(alert.impact)} perdus sur la période`;
    case "price_below_cost":
      return `Tarif ${formatPercent(Number(value))} sous le coût actuel`;
    case "dormant":
      return `${value == null ? "Jamais vendu" : `${value} j sans vente`} · ${formatMoney(alert.impact)} immobilisés`;
    case "expiry":
      return `DLC ${formatShortDate(String(value ?? ""))}`;
    case "low_cover":
      return `${formatDays(Number(value))} de stock restant`;
    case "overstock":
      return `${formatDays(Number(value))} de stock · ${formatMoney(alert.impact)} en excès`;
    case "discount":
      return `Prix moyen ${formatPercent(Number(value))} sous le tarif`;
    case "estimated_cost":
      return "Coût de certaines sorties estimé au coût actuel";
  }
}

/** Action recommandée principale : l'alerte la plus coûteuse, sinon la consigne du quadrant. */
export function primaryAction(row: ItemAnalyticsRow): string | null {
  const alert = [...row.alerts].filter((item) => item.code !== "estimated_cost").sort((a, b) => b.impact - a.impact)[0];
  if (alert) {
    const actions: Record<AnalyticsAlertCode, string> = {
      negative_margin: "Corriger le prix de vente ou le prix d’achat",
      price_below_cost: "Relever le tarif au-dessus du coût",
      dormant: "Écouler (promo, retour fournisseur) ou déréférencer",
      expiry: "Écouler en priorité les lots courts",
      low_cover: "Réapprovisionner",
      overstock: "Suspendre les achats et pousser les ventes",
      discount: "Encadrer les remises accordées",
      estimated_cost: "",
    };
    return actions[alert.code];
  }
  return row.quadrant ? QUADRANTS[row.quadrant].action : null;
}

export type AlertFilter = AnalyticsAlertCode | "any" | "";

export interface ItemFilters {
  search: string;
  quadrant: Quadrant | "";
  abc: AbcClass | "";
  alert: AlertFilter;
}

export const EMPTY_FILTERS: ItemFilters = { search: "", quadrant: "", abc: "", alert: "" };

export function filterItems(rows: ItemAnalyticsRow[], filters: ItemFilters) {
  const term = filters.search.trim().toLowerCase();
  return rows.filter((row) => {
    if (term && !`${row.item_code} ${row.item_name} ${row.brand ?? ""}`.toLowerCase().includes(term)) return false;
    if (filters.quadrant && row.quadrant !== filters.quadrant) return false;
    if (filters.abc && row.abc !== filters.abc) return false;
    if (filters.alert === "any") return row.alerts.some((alert) => alert.code !== "estimated_cost");
    if (filters.alert) return row.alerts.some((alert) => alert.code === filters.alert);
    return true;
  });
}

/** Articles à traiter en premier : impact chiffré décroissant. */
export function priorityActions(rows: ItemAnalyticsRow[], limit = 8) {
  return rows
    .filter((row) => row.impact > 0)
    .sort((a, b) => b.impact - a.impact)
    .slice(0, limit);
}

// --- Périodes ----------------------------------------------------------------

export type PeriodPreset = "30" | "90" | "365" | "year" | "custom";

export const PERIOD_PRESETS: Array<{ value: Exclude<PeriodPreset, "custom">; label: string }> = [
  { value: "30", label: "30 j" },
  { value: "90", label: "90 j" },
  { value: "365", label: "12 mois" },
  { value: "year", label: "Année" },
];

function isoDay(date: Date) {
  return date.toLocaleDateString("en-CA");
}

export function presetRange(preset: Exclude<PeriodPreset, "custom">, today = new Date()) {
  const to = isoDay(today);
  if (preset === "year") return { from: `${today.getFullYear()}-01-01`, to };
  const start = new Date(today);
  start.setDate(start.getDate() - Number(preset) + 1);
  return { from: isoDay(start), to };
}

// --- Export ------------------------------------------------------------------

function csvCell(value: unknown) {
  if (value == null) return "";
  const text = typeof value === "number" ? String(value).replace(".", ",") : String(value);
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function itemsCsv(rows: ItemAnalyticsRow[]) {
  const columns: Array<[string, (row: ItemAnalyticsRow) => unknown]> = [
    ["Code", (row) => row.item_code],
    ["Article", (row) => row.item_name],
    ["Groupe", (row) => row.item_group],
    ["Marque", (row) => row.brand],
    ["Classe ABC", (row) => row.abc],
    ["Quadrant", (row) => (row.quadrant ? QUADRANTS[row.quadrant].label : "")],
    ["Qté vendue", (row) => row.qty],
    ["CA HT", (row) => row.revenue],
    ["Coût", (row) => row.cost],
    ["Marge", (row) => row.margin],
    ["Taux de marque", (row) => row.margin_rate],
    ["Taux de marge", (row) => row.markup],
    ["Part de la marge", (row) => row.margin_share],
    ["Stock (qté)", (row) => row.stock_qty],
    ["Stock (valeur)", (row) => row.stock_value],
    ["Couverture (j)", (row) => row.cover_days],
    ["Rotation", (row) => row.rotation],
    ["GMROI", (row) => row.gmroi],
    ["Dernière vente", (row) => row.last_sale],
    ["Évolution CA", (row) => row.revenue_delta],
    ["Alertes", (row) => row.alerts.map((alert) => ALERT_LABELS[alert.code]).join(", ")],
    ["Impact (DA)", (row) => row.impact],
    ["Action", (row) => primaryAction(row)],
  ];
  const lines = [columns.map(([label]) => label), ...rows.map((row) => columns.map(([, read]) => read(row)))];
  return lines.map((line) => line.map(csvCell).join(";")).join("\n");
}

export function downloadCsv(filename: string, content: string) {
  const blob = new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
