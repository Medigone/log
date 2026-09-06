import type { DeliveryOutcome, EvidenceInput, PaymentInput, RouteStopItem } from "@/shared/types/distribution";

interface StopValidationInput {
  outcome: DeliveryOutcome;
  quantities: Record<string, number>;
  failureReason: string;
  comment: string;
  evidence: Partial<EvidenceInput>;
  paymentEnabled: boolean;
  payment: Partial<PaymentInput>;
  amountToCollect: number;
  requiresCustomerGeolocation: boolean;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function estimatedCollectableAmount(
  stop: {
    amountToCollect: number;
    items?: Array<Pick<RouteStopItem, "name" | "quantity" | "remainingQuantity" | "rate" | "amount">>;
  },
  outcome: DeliveryOutcome,
  quantities: Record<string, number>,
) {
  if (outcome === "failed") return 0;
  const remaining = Math.max(stop.amountToCollect || 0, 0);
  if (outcome !== "partial") return remaining;
  const items = stop.items || [];
  let remainingNet = 0;
  let deliveredNet = 0;
  for (const item of items) {
    const remainingQty = Math.max(item.remainingQuantity || 0, 0);
    const deliveredQty = Math.min(Math.max(Number(quantities[item.name] || 0), 0), remainingQty);
    const rate = item.rate ?? (item.quantity > 0 && item.amount ? item.amount / item.quantity : 0);
    remainingNet += rate * remainingQty;
    deliveredNet += rate * deliveredQty;
  }
  if (remainingNet > 0) return roundMoney(remaining * (deliveredNet / remainingNet));
  const remainingQty = items.reduce((sum, item) => sum + Math.max(item.remainingQuantity || 0, 0), 0);
  const deliveredQty = items.reduce((sum, item) => sum + Math.max(Number(quantities[item.name] || 0), 0), 0);
  if (remainingQty <= 0) return 0;
  return roundMoney(remaining * (deliveredQty / remainingQty));
}

export function validateStopForm(input: StopValidationInput): string {
  if (
    input.evidence.latitude == null
    || input.evidence.longitude == null
    || (input.evidence.latitude === 0 && input.evidence.longitude === 0)
  ) return "La position GPS est obligatoire.";
  if (input.requiresCustomerGeolocation && input.outcome !== "failed") {
    if (input.evidence.accuracy == null || input.evidence.accuracy < 0 || input.evidence.accuracy > 50) {
      return "Localisez le client avec une précision de 50 m ou meilleure.";
    }
  }
  if (input.outcome === "partial" && !Object.values(input.quantities).some((quantity) => quantity > 0)) return "Saisissez au moins une quantité livrée.";
  if (input.outcome === "failed" && (!input.failureReason || !input.comment.trim())) return "Le motif et le commentaire sont obligatoires.";
  if (input.paymentEnabled && (!input.payment.amount || input.payment.amount <= 0)) return "Le paiement doit être positif.";
  if (input.paymentEnabled && input.payment.method === "cheque" && (!input.payment.chequePhotoData || !input.payment.collectionDate || !input.payment.chequeNumber?.trim())) return "La photo, le numéro et la date d’encaissement du chèque sont obligatoires.";
  return "";
}
