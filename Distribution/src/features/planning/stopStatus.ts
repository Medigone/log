export type StopVisualState = "delivered" | "partial" | "failed" | "active" | "cancelled" | "pending";

export interface StopVisualStyle {
  state: StopVisualState;
  label: string;
  markerClass: string;
  markerSymbol?: string;
  cardClass: string;
  sequenceClass: string;
  badgeClass: string;
  processed: boolean;
}

const STOP_STYLES: Record<StopVisualState, StopVisualStyle> = {
  delivered: {
    state: "delivered",
    label: "Livré",
    markerClass: "distribution-map-marker--delivered",
    markerSymbol: "✓",
    cardClass: "border-emerald-300 bg-emerald-50/50",
    sequenceClass: "bg-emerald-600 text-white",
    badgeClass: "bg-emerald-100 text-emerald-800",
    processed: true,
  },
  partial: {
    state: "partial",
    label: "Partiellement livré",
    markerClass: "distribution-map-marker--partial",
    markerSymbol: "½",
    cardClass: "border-amber-300 bg-amber-50/50",
    sequenceClass: "bg-amber-500 text-white",
    badgeClass: "bg-amber-100 text-amber-900",
    processed: true,
  },
  failed: {
    state: "failed",
    label: "Non livré",
    markerClass: "distribution-map-marker--failed",
    markerSymbol: "×",
    cardClass: "border-red-300 bg-red-50/40",
    sequenceClass: "bg-red-600 text-white",
    badgeClass: "bg-red-100 text-red-800",
    processed: true,
  },
  active: {
    state: "active",
    label: "En cours",
    markerClass: "distribution-map-marker--active",
    cardClass: "border-blue-300 bg-blue-50/40",
    sequenceClass: "bg-blue-700 text-white",
    badgeClass: "bg-blue-100 text-blue-800",
    processed: false,
  },
  cancelled: {
    state: "cancelled",
    label: "Annulé",
    markerClass: "distribution-map-marker--cancelled",
    markerSymbol: "×",
    cardClass: "border-slate-300 bg-slate-100/70",
    sequenceClass: "bg-slate-500 text-white",
    badgeClass: "bg-slate-200 text-slate-700",
    processed: true,
  },
  pending: {
    state: "pending",
    label: "À venir",
    markerClass: "distribution-map-marker--pending",
    cardClass: "border-slate-200 bg-white",
    sequenceClass: "bg-slate-100 text-slate-700",
    badgeClass: "bg-slate-100 text-slate-700",
    processed: false,
  },
};

export function getStopVisualStyle(status: string): StopVisualStyle {
  const normalized = status.trim().toLocaleLowerCase("fr");
  if (normalized === "livré" || normalized === "livree" || normalized === "livrée") {
    return STOP_STYLES.delivered;
  }
  if (normalized.includes("partiel")) return STOP_STYLES.partial;
  if (normalized === "non livré" || normalized === "non livrée" || normalized === "échec") {
    return STOP_STYLES.failed;
  }
  if (normalized === "annulé" || normalized === "annulée") return STOP_STYLES.cancelled;
  if (normalized === "enlevé" || normalized === "enlevée" || normalized === "en cours") {
    return STOP_STYLES.active;
  }
  return STOP_STYLES.pending;
}
