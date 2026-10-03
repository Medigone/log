import type { StatusTone } from "@/shared/design/statusTone";
import type { ReceiptStatus } from "@/shared/api/receipts";

const TONES: Record<ReceiptStatus, StatusTone> = {
  en_cours: "info",
  a_valider: "warning",
  valide: "success",
  annule: "neutral",
};

export function receiptStatusTone(status: ReceiptStatus): StatusTone {
  return TONES[status] ?? "neutral";
}
