import { formatMoney } from "@/shared/format";
import type { CashCollection, CashReconciliation, DistributionRoute, InvoiceAllocation } from "@/shared/types/distribution";

export const CASH_STATUSES = ["À contrôler", "Écart", "Validée", "Sans encaissement"] as const;
export type CashStatus = (typeof CASH_STATUSES)[number];

/** Seuil d’affichage / blocage d’un écart (centimes ignorés en dessous). */
export const GAP_EPS = 0.5;

export interface PaymentEdit {
  countedAmount: string;
  chequeNumber: string;
  allocations: InvoiceAllocation[];
}

export interface CashBlocker {
  key: string;
  title: string;
  detail: string;
  tone: "success" | "danger" | "neutral";
  buttonLabel: string;
  buttonDisabled: boolean;
  buttonVariant: "default" | "destructive";
  submitAsResolve: boolean;
}

export interface CashierListKpis {
  toControlAmount: number;
  toControlCount: number;
  oldestToControl?: string;
  gapAmount: number;
  gapCount: number;
  chequesAmount: number;
  chequePaymentCount: number;
  validatedAmount: number;
  validatedCount: number;
}

export function paymentEdits(payments: CashCollection[]): Record<string, PaymentEdit> {
  return Object.fromEntries(
    payments.map((payment) => [
      payment.name,
      {
        countedAmount: String(payment.countedAmount || payment.amount),
        chequeNumber: payment.chequeNumber || "",
        allocations: payment.allocations.map((allocation) => ({ ...allocation })),
      },
    ]),
  );
}

export function countedAmountOf(payment: CashCollection, edit?: PaymentEdit) {
  if (edit?.countedAmount != null && edit.countedAmount !== "") return Number(edit.countedAmount) || 0;
  return payment.countedAmount || payment.amount || 0;
}

export function allocatedOf(edit?: PaymentEdit) {
  return edit?.allocations.reduce((sum, allocation) => sum + (allocation.allocatedAmount || 0), 0) || 0;
}

export function countedChequesOf(payments: CashCollection[], edits: Record<string, PaymentEdit>) {
  return payments
    .filter((payment) => payment.method === "Chèque")
    .reduce((sum, payment) => sum + countedAmountOf(payment, edits[payment.name]), 0);
}

export function chequeCountOf(payments: CashCollection[]) {
  return payments.filter((payment) => payment.method === "Chèque").length;
}

export function countedTotalOf(countedCash: number, countedCheques: number) {
  return countedCash + countedCheques;
}

export function cashGap(countedTotal: number, declaredTotal: number) {
  return countedTotal - declaredTotal;
}

export function hasMaterialGap(gap: number) {
  return Math.abs(gap) > GAP_EPS;
}

export function formatSignedMoney(value: number) {
  if (Math.abs(value) < GAP_EPS) return formatMoney(0, { precise: true });
  const formatted = formatMoney(Math.abs(value), { precise: true });
  return `${value > 0 ? "+" : "−"}${formatted}`;
}

export function plural(count: number, singular: string, pluralForm: string) {
  return `${count} ${count > 1 ? pluralForm : singular}`;
}

export function chequeNeedsNumber(payment: CashCollection, edit?: PaymentEdit) {
  return payment.method === "Chèque" && !String(edit?.chequeNumber || payment.chequeNumber || "").trim();
}

export function isOverAllocated(counted: number, allocated: number) {
  return allocated - counted > GAP_EPS;
}

export function advanceOf(counted: number, allocated: number) {
  return Math.max(counted - allocated, 0);
}

export function allocateToOldest(counted: number, allocations: InvoiceAllocation[]): InvoiceAllocation[] {
  let remaining = Math.max(counted, 0);
  return allocations.map((allocation) => {
    const amount = Math.min(Math.max(allocation.outstandingBefore, 0), remaining);
    remaining = Math.max(remaining - amount, 0);
    return { ...allocation, allocatedAmount: amount };
  });
}

export function dueDateOverdue(dueDate?: string, today = new Date()) {
  if (!dueDate) return false;
  const stamp = dueDate.slice(0, 10);
  const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  return stamp < iso;
}

export type PaymentRowState = "Comptabilisé" | "À vérifier" | "Avance" | "Prêt";

export function paymentRowState(
  payment: CashCollection,
  edit: PaymentEdit | undefined,
  cashStatus: string,
): PaymentRowState {
  if (cashStatus === "Validée" || payment.status === "Validé") return "Comptabilisé";
  if (chequeNeedsNumber(payment, edit)) return "À vérifier";
  const counted = countedAmountOf(payment, edit);
  const allocated = allocatedOf(edit);
  if (advanceOf(counted, allocated) > GAP_EPS) return "Avance";
  return "Prêt";
}

export function routeDeclaredGap(route: DistributionRoute) {
  if (route.cash.status !== "Écart") return null;
  return cashGap(route.cash.countedTotal, route.cash.declaredTotal);
}

export function paymentClientCount(route: DistributionRoute) {
  const names = new Set(
    (route.cash.payments || []).map((payment) => payment.customerName || payment.customer || payment.deliveryNote),
  );
  return names.size || (route.cash.payments || []).length;
}

export function routeMatchesQuery(route: DistributionRoute, query: string) {
  if (!query) return true;
  const haystack = [
    route.name,
    route.driverName,
    route.driver,
    route.vehicleLabel,
    route.vehicle,
    ...(route.cash.payments || []).flatMap((payment) => [payment.customerName, payment.customer, payment.deliveryNote]),
    ...(route.stops || []).flatMap((stop) => [stop.customerName, stop.deliveryNote]),
  ]
    .filter(Boolean)
    .join(" ")
    .toLocaleLowerCase("fr");
  return haystack.includes(query);
}

export function cashierListKpis(routes: DistributionRoute[]): CashierListKpis {
  let toControlAmount = 0;
  let toControlCount = 0;
  let oldestToControl: string | undefined;
  let gapAmount = 0;
  let gapCount = 0;
  let chequesAmount = 0;
  let chequePaymentCount = 0;
  let validatedAmount = 0;
  let validatedCount = 0;

  for (const route of routes) {
    const cash = route.cash;
    const status = cash.status;
    if (status === "À contrôler") {
      toControlAmount += cash.declaredTotal || 0;
      toControlCount += 1;
      if (!oldestToControl || (route.date && route.date < oldestToControl)) oldestToControl = route.date;
    }
    if (status === "Écart") {
      gapAmount += cashGap(cash.countedTotal, cash.declaredTotal);
      gapCount += 1;
    }
    if (status !== "Validée") {
      chequesAmount += cash.declaredCheques || 0;
      chequePaymentCount += chequeCountOf(cash.payments || []);
    }
    if (status === "Validée") {
      validatedAmount += cash.declaredTotal || 0;
      validatedCount += 1;
    }
  }

  return {
    toControlAmount,
    toControlCount,
    oldestToControl,
    gapAmount,
    gapCount,
    chequesAmount,
    chequePaymentCount,
    validatedAmount,
    validatedCount,
  };
}

export function oldestToControlRoute(routes: DistributionRoute[]) {
  return [...routes]
    .filter((route) => route.cash.status === "À contrôler")
    .sort((a, b) => String(a.date).localeCompare(String(b.date)) || a.name.localeCompare(b.name))[0];
}

export function cashBlocker({
  status,
  payments,
  edits,
  countedCash,
  declaredTotal,
  reason,
  canResolveDiscrepancy,
}: {
  status: string;
  payments: CashCollection[];
  edits: Record<string, PaymentEdit>;
  countedCash: number;
  declaredTotal: number;
  reason: string;
  canResolveDiscrepancy: boolean;
}): CashBlocker {
  const cheques = countedChequesOf(payments, edits);
  const total = countedTotalOf(countedCash, cheques);
  const gap = cashGap(total, declaredTotal);
  const missingCheque = payments.some((payment) => chequeNeedsNumber(payment, edits[payment.name]));
  const overAllocated = payments.some((payment) => {
    const counted = countedAmountOf(payment, edits[payment.name]);
    return isOverAllocated(counted, allocatedOf(edits[payment.name]));
  });

  if (status === "Validée") {
    return {
      key: "validated",
      title: "Contrôle terminé",
      detail: "Règlements créés. Aucune modification possible.",
      tone: "success",
      buttonLabel: "Contrôle validé",
      buttonDisabled: true,
      buttonVariant: "default",
      submitAsResolve: false,
    };
  }
  if (!payments.length) {
    return {
      key: "empty",
      title: "Rien à contrôler",
      detail: "Aucun encaissement déclaré sur cette tournée.",
      tone: "neutral",
      buttonLabel: "Valider le contrôle de caisse",
      buttonDisabled: true,
      buttonVariant: "default",
      submitAsResolve: false,
    };
  }
  if (missingCheque) {
    return {
      key: "cheque-number",
      title: "Numéro de chèque manquant",
      detail: "Saisissez le numéro de chaque chèque avant de valider.",
      tone: "danger",
      buttonLabel: "Valider le contrôle de caisse",
      buttonDisabled: true,
      buttonVariant: "default",
      submitAsResolve: false,
    };
  }
  if (overAllocated) {
    return {
      key: "over-allocated",
      title: "Ventilation supérieure au montant compté",
      detail: "Réduisez les montants affectés ou laissez le solde en avance client.",
      tone: "danger",
      buttonLabel: "Valider le contrôle de caisse",
      buttonDisabled: true,
      buttonVariant: "default",
      submitAsResolve: false,
    };
  }
  if (hasMaterialGap(gap) && !reason.trim()) {
    return {
      key: "gap-reason",
      title: "Motif d'écart manquant",
      detail: `Un écart de ${formatSignedMoney(gap)} doit être justifié.`,
      tone: "danger",
      buttonLabel: canResolveDiscrepancy ? "Approuver et comptabiliser l’écart" : "Transmettre l’écart au responsable",
      buttonDisabled: true,
      buttonVariant: "destructive",
      submitAsResolve: canResolveDiscrepancy,
    };
  }
  if (hasMaterialGap(gap) || status === "Écart") {
    if (status === "Écart" && !canResolveDiscrepancy) {
      return {
        key: "gap-pending",
        title: "Écart à transmettre",
        detail: "Écart transmis au responsable. Aucun Payment Entry ne sera créé avant sa décision.",
        tone: "danger",
        buttonLabel: "Transmettre l’écart au responsable",
        buttonDisabled: true,
        buttonVariant: "destructive",
        submitAsResolve: false,
      };
    }
    return {
      key: "gap-ready",
      title: canResolveDiscrepancy ? "Écart à approuver" : "Écart à transmettre",
      detail: canResolveDiscrepancy
        ? "La validation crée les Payment Entries ERPNext et remet la caisse du livreur à zéro."
        : "L’écart sera transmis au responsable. Aucun règlement n’est créé.",
      tone: "danger",
      buttonLabel: canResolveDiscrepancy ? "Approuver et comptabiliser l’écart" : "Transmettre l’écart au responsable",
      buttonDisabled: false,
      buttonVariant: "destructive",
      submitAsResolve: canResolveDiscrepancy,
    };
  }
  return {
    key: "ready",
    title: "Prêt à valider",
    detail: "La validation crée les Payment Entries ERPNext et remet la caisse du livreur à zéro.",
    tone: "neutral",
    buttonLabel: "Valider le contrôle de caisse",
    buttonDisabled: false,
    buttonVariant: "default",
    submitAsResolve: false,
  };
}

export function detailCounted(reconciliation: CashReconciliation | undefined, countedCash: string, edits: Record<string, PaymentEdit>) {
  const payments = reconciliation?.payments || [];
  const cash = Number(countedCash || 0);
  const cheques = countedChequesOf(payments, edits);
  const total = countedTotalOf(cash, cheques);
  const declared = reconciliation?.declaredTotal || 0;
  return {
    countedCash: cash,
    countedCheques: cheques,
    countedTotal: total,
    gap: cashGap(total, declared),
    chequeCount: chequeCountOf(payments),
  };
}
