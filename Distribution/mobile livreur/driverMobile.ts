import type { DeliveryOutcome, RouteStop } from "@/shared/types/distribution";
import { isStopCompleted } from "@/features/driver/stopHelpers";

export type StopVisualState = "delivered" | "partial" | "failed" | "current" | "upcoming";

export function stopVisualState(stop: RouteStop, isCurrent: boolean): StopVisualState {
  switch (stop.status) {
    case "Livré":
      return "delivered";
    case "Partiellement Livré":
      return "partial";
    case "Non Livré":
      return "failed";
    default:
      return isCurrent ? "current" : "upcoming";
  }
}

/** Tones alignés sur shared/design/statusTone — un seul point de vérité pour la couleur d'un arrêt. */
export const STOP_STATE_TONE: Record<StopVisualState, "positive" | "warning" | "critical" | "brand" | "neutral"> = {
  delivered: "positive",
  partial: "warning",
  failed: "critical",
  current: "brand",
  upcoming: "neutral",
};

export interface RouteProgress {
  total: number;
  done: number;
  remaining: number;
  delivered: number;
  partial: number;
  failed: number;
  collectedAmount: number;
  currentIndex: number;
}

export function routeProgress(stops: RouteStop[]): RouteProgress {
  let delivered = 0;
  let partial = 0;
  let failed = 0;
  let collectedAmount = 0;
  stops.forEach((stop) => {
    if (stop.status === "Livré") delivered += 1;
    else if (stop.status === "Partiellement Livré") partial += 1;
    else if (stop.status === "Non Livré") failed += 1;
    collectedAmount += stop.collectedAmount || 0;
  });
  const done = delivered + partial + failed;
  const currentIndex = stops.findIndex((stop) => !isStopCompleted(stop));
  return {
    total: stops.length,
    done,
    remaining: stops.length - done,
    delivered,
    partial,
    failed,
    collectedAmount,
    currentIndex: currentIndex === -1 ? stops.length : currentIndex,
  };
}

const AVERAGE_STOP_MINUTES = 14;

/**
 * ETA locale et volontairement naïve : aucun champ serveur n'existe aujourd'hui.
 * À remplacer par une valeur d'API — ou à masquer via le drapeau d'affichage.
 */
export function estimateArrivals(stops: RouteStop[], from: Date = new Date()): Map<string, string> {
  const etas = new Map<string, string>();
  let cursor = from.getTime();
  stops.forEach((stop) => {
    if (isStopCompleted(stop)) return;
    cursor += AVERAGE_STOP_MINUTES * 60_000;
    etas.set(
      stop.deliveryNote,
      new Date(cursor).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
    );
  });
  return etas;
}

export interface CashReconciliation {
  cash: number;
  cheque: number;
  chequeCount: number;
  total: number;
  expected: number;
  gap: number;
  balanced: boolean;
}

export function cashReconciliation(stops: RouteStop[], expected?: number | null): CashReconciliation {
  let cash = 0;
  let cheque = 0;
  let chequeCount = 0;
  let noteTotal = 0;
  stops.forEach((stop) => {
    const amount = stop.collectedAmount || 0;
    if (stop.paymentMode === "Chèque") {
      cheque += amount;
      if (amount) chequeCount += 1;
    } else {
      cash += amount;
    }
    if (isStopCompleted(stop) && stop.status !== "Non Livré") {
      noteTotal += stop.totalAmount || 0;
    }
  });
  const total = cash + cheque;
  const target = expected ?? noteTotal;
  return {
    cash,
    cheque,
    chequeCount,
    total,
    expected: target,
    gap: total - target,
    balanced: Math.abs(total - target) < 0.01,
  };
}

export function returnedArticleCount(stops: RouteStop[]): number {
  return stops.reduce((sum, stop) => {
    if (stop.status === "Livré" || !isStopCompleted(stop)) return sum;
    const planned = stop.items?.reduce((acc, item) => acc + (item.quantity || 0), 0) || stop.totalQuantity || 0;
    const deliveredQty = stop.deliveredQuantity ?? (stop.status === "Non Livré" ? 0 : planned);
    return sum + Math.max(planned - deliveredQty, 0);
  }, 0);
}

export function formatDinars(value: number, withCents = true): string {
  return `${value.toLocaleString("fr-FR", {
    minimumFractionDigits: withCents ? 2 : 0,
    maximumFractionDigits: withCents ? 2 : 0,
  })} DA`;
}

export const OUTCOME_LABEL: Record<DeliveryOutcome, string> = {
  full: "Livré en totalité",
  partial: "Livraison partielle",
  failed: "Échec de livraison",
};
