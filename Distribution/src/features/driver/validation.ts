import type { DeliveryOutcome, EvidenceInput, PaymentInput } from "@/shared/types/distribution";

interface StopValidationInput {
  outcome: DeliveryOutcome;
  quantities: Record<string, number>;
  failureReason: string;
  comment: string;
  evidence: Partial<EvidenceInput>;
  paymentEnabled: boolean;
  payment: Partial<PaymentInput>;
  amountToCollect: number;
}

export function validateStopForm(input: StopValidationInput): string {
  if (input.evidence.latitude == null || input.evidence.longitude == null) return "La position GPS est obligatoire.";
  if (input.outcome !== "failed" && !input.evidence.photoData && !input.evidence.signatureData) return "Ajoutez une photo ou une signature.";
  if (input.evidence.signatureData && !input.evidence.signerName?.trim()) return "Saisissez le nom du signataire.";
  if (input.outcome === "partial" && !Object.values(input.quantities).some((quantity) => quantity > 0)) return "Saisissez au moins une quantité livrée.";
  if (input.outcome === "failed" && (!input.failureReason || !input.comment.trim())) return "Le motif et le commentaire sont obligatoires.";
  if (input.paymentEnabled && (!input.payment.amount || input.payment.amount <= 0 || input.payment.amount > input.amountToCollect)) return "Le paiement doit être positif et ne pas dépasser le solde.";
  if (input.paymentEnabled && input.payment.method === "cheque" && (!input.payment.chequePhotoData || !input.payment.collectionDate)) return "La photo et la date d’encaissement du chèque sont obligatoires.";
  return "";
}
