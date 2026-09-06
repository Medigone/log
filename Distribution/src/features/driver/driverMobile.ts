import type { DeliveryOutcome, RouteStop, StopPayment } from "@/shared/types/distribution";
import { isStopCompleted } from "@/features/driver/stopHelpers";
import { formatMoney, formatTime } from "@/shared/format";

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
  for (const stop of stops) {
    if (stop.status === "Livré") delivered += 1;
    else if (stop.status === "Partiellement Livré") partial += 1;
    else if (stop.status === "Non Livré") failed += 1;
    collectedAmount += stop.amountCollected || 0;
  }
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

/** ETA locale naïve — à masquer tant qu’aucun champ serveur n’existe. */
export function estimateArrivals(stops: RouteStop[], from: Date = new Date()): Map<string, string> {
  const etas = new Map<string, string>();
  let cursor = from.getTime();
  for (const stop of stops) {
    if (isStopCompleted(stop)) continue;
    cursor += AVERAGE_STOP_MINUTES * 60_000;
    etas.set(stop.deliveryNote, new Date(cursor).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }));
  }
  return etas;
}

export function stopExpectedAmount(stop: RouteStop) {
  return stop.grandTotal ?? stop.netTotal ?? (stop.amountCollected || 0) + (stop.amountToCollect || 0);
}

function isCheque(payment: StopPayment) {
  return /ch[eè]que/i.test(payment.method);
}

export function stopPaymentKind(stop: RouteStop) {
  const payments = (stop.payments || []).filter((payment) => (payment.amount || 0) > 0);
  if (!payments.length) return undefined;
  const cheque = payments.filter(isCheque);
  const cash = payments.filter((payment) => !isCheque(payment));
  if (cheque.length && !cash.length) return "chèque";
  if (cash.length && !cheque.length) return "espèces";
  return undefined;
}

export function stopArticleProgress(stop: RouteStop) {
  const items = stop.items || [];
  if (!items.length) return { delivered: 0, total: stop.totalQuantity || 0 };
  return {
    delivered: items.reduce((sum, item) => sum + (item.deliveredQuantity || 0), 0),
    total: items.reduce((sum, item) => sum + (item.quantity || 0), 0),
  };
}

/** Ligne secondaire d’un arrêt compact dans la timeline. */
export function stopTimelineDetail(stop: RouteStop, state: StopVisualState) {
  const time = formatTime(stop.completedAt);
  const clock = time && time !== "—" ? time : "";
  if (state === "failed") {
    return [clock, stop.failureReason || "non livré"].filter(Boolean).join(" · ");
  }
  if (state === "partial") {
    const { delivered, total } = stopArticleProgress(stop);
    return [clock, `partiel ${delivered}/${total} art.`].filter(Boolean).join(" · ");
  }
  if (state === "delivered") {
    return [clock, "livré", stopPaymentKind(stop)].filter(Boolean).join(" · ");
  }
  return [stop.commune, stop.totalQuantity ? `${stop.totalQuantity} art.` : "", formatMoney(stopExpectedAmount(stop))]
    .filter(Boolean)
    .join(" · ");
}

export interface CashHandover {
  cash: number;
  cheque: number;
  chequeCount: number;
  total: number;
  expected: number;
  gap: number;
  balanced: boolean;
}

export function cashHandover(stops: RouteStop[]): CashHandover {
  let cash = 0;
  let cheque = 0;
  let chequeCount = 0;
  let expected = 0;
  for (const stop of stops) {
    const amount = stop.amountCollected || 0;
    const chequePayments = (stop.payments || []).filter(isCheque);
    const chequeAmount = chequePayments.reduce((sum, payment) => sum + (payment.amount || 0), 0);
    if (chequeAmount > 0) {
      cheque += chequeAmount;
      chequeCount += chequePayments.length || (amount ? 1 : 0);
      cash += Math.max(amount - chequeAmount, 0);
    } else {
      cash += amount;
    }
    if (isStopCompleted(stop) && stop.status !== "Non Livré") {
      expected += stopExpectedAmount(stop);
    }
  }
  const total = cash + cheque;
  return {
    cash,
    cheque,
    chequeCount,
    total,
    expected,
    gap: total - expected,
    balanced: Math.abs(total - expected) < 0.01,
  };
}

/** Après validation, plus rien à remettre pour cette tournée. */
export function remainingHandover(collected: CashHandover, validated: boolean): Pick<CashHandover, "cash" | "cheque" | "chequeCount" | "total"> {
  if (!validated) {
    return {
      cash: collected.cash,
      cheque: collected.cheque,
      chequeCount: collected.chequeCount,
      total: collected.total,
    };
  }
  return { cash: 0, cheque: 0, chequeCount: 0, total: 0 };
}

export function returnedArticleCount(stops: RouteStop[]): number {
  return stops.reduce((sum, stop) => {
    if (stop.status === "Livré" || !isStopCompleted(stop)) return sum;
    if (stop.items?.length) {
      return (
        sum +
        stop.items.reduce((acc, item) => {
          const leftover = item.remainingQuantity ?? Math.max((item.quantity || 0) - (item.deliveredQuantity || 0), 0);
          return acc + leftover;
        }, 0)
      );
    }
    return sum + (stop.totalQuantity || 0);
  }, 0);
}

export function formatDriverMoney(value: number, precise = false) {
  return formatMoney(value, { precise });
}

export const OUTCOME_LABEL: Record<DeliveryOutcome, string> = {
  delivered: "Livré en totalité",
  partial: "Livraison partielle",
  failed: "Échec de livraison",
};
