import { TONES, type StatusTone, type ToneStyle } from "@/shared/design/statusTone";

export type StopVisualState = "delivered" | "partial" | "failed" | "active" | "cancelled" | "pending";

export interface StopVisualStyle {
  state: StopVisualState;
  tone: StatusTone;
  label: string;
  markerClass: string;
  markerSymbol?: string;
  cardClass: string;
  sequenceClass: string;
  badgeClass: string;
  railClass: string;
  processed: boolean;
}

interface StopDefinition {
  tone: StatusTone;
  label: string;
  markerSymbol?: string;
  processed: boolean;
  /** Surdéfinit la surface de la tonalité quand l'état demande un rendu propre. */
  cardClass?: string;
  sequenceClass?: string;
}

const STOP_DEFINITIONS: Record<StopVisualState, StopDefinition> = {
  delivered: { tone: "success", label: "Livré", markerSymbol: "✓", processed: true },
  partial: { tone: "warning", label: "Partiellement livré", markerSymbol: "½", processed: true },
  failed: { tone: "danger", label: "Non livré", markerSymbol: "×", processed: true },
  active: { tone: "info", label: "En cours", processed: false },
  cancelled: {
    tone: "neutral",
    label: "Annulé",
    markerSymbol: "×",
    processed: true,
    cardClass: "border-slate-300 bg-slate-100/70",
    sequenceClass: "bg-slate-500 text-white",
  },
  pending: { tone: "neutral", label: "À venir", processed: false },
};

function build(state: StopVisualState): StopVisualStyle {
  const definition = STOP_DEFINITIONS[state];
  const tone: ToneStyle = TONES[definition.tone];
  return {
    state,
    tone: definition.tone,
    label: definition.label,
    markerClass: `distribution-map-marker--${state}`,
    markerSymbol: definition.markerSymbol,
    cardClass: definition.cardClass ?? tone.surface,
    sequenceClass: definition.sequenceClass ?? tone.solid,
    badgeClass: tone.badge,
    railClass: tone.rail,
    processed: definition.processed,
  };
}

const STOP_STYLES: Record<StopVisualState, StopVisualStyle> = {
  delivered: build("delivered"),
  partial: build("partial"),
  failed: build("failed"),
  active: build("active"),
  cancelled: build("cancelled"),
  pending: build("pending"),
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
