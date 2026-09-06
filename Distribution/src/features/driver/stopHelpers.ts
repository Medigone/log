import type { DeliveryOutcome, EvidenceInput, PaymentInput, RouteStop } from "@/shared/types/distribution";

export const COMPLETED_STOP_STATUSES = ["Livré", "Partiellement Livré", "Non Livré"];

export const FAILURE_REASONS = [
  "Client absent",
  "Client fermé",
  "Adresse introuvable",
  "Refus client",
  "Paiement refusé",
  "Accès impossible",
  "Autre",
];

export interface SavedStopForm {
  requestId?: string;
  outcome?: DeliveryOutcome;
  quantities?: Record<string, number>;
  failureReason?: string;
  comment?: string;
  evidence?: Partial<EvidenceInput>;
  paymentEnabled?: boolean;
  payment?: Partial<PaymentInput>;
}

export function isStopCompleted(stop: Pick<RouteStop, "status">) {
  return COMPLETED_STOP_STATUSES.includes(stop.status);
}

export function remainingStops<T extends Pick<RouteStop, "status">>(stops: T[]) {
  return stops.filter((stop) => !isStopCompleted(stop));
}

export function completedStops<T extends Pick<RouteStop, "status">>(stops: T[]) {
  return stops.filter((stop) => isStopCompleted(stop));
}

export function stopFormKey(routeId: string, deliveryNote: string) {
  return `intrapro-distribution.stop-form.${routeId}.${deliveryNote}`;
}

export function readStopForm(key: string): SavedStopForm {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || "{}");
    return value && typeof value === "object" ? (value as SavedStopForm) : {};
  } catch {
    return {};
  }
}

export function directionUrl(stop: Pick<RouteStop, "latitude" | "longitude" | "address" | "commune" | "wilaya">) {
  const destination =
    stop.latitude != null && stop.longitude != null
      ? `${stop.latitude},${stop.longitude}`
      : [stop.address, stop.commune, stop.wilaya].filter(Boolean).join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`;
}

export function stopAddress(stop: Pick<RouteStop, "address" | "commune" | "wilaya">) {
  return stop.address || [stop.commune, stop.wilaya].filter(Boolean).join(", ") || "Adresse non renseignée";
}

export async function compressImage(file: File): Promise<string> {
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Image illisible"));
    element.src = source;
  });
  const max = 1440;
  const ratio = Math.min(max / image.width, max / image.height, 1);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * ratio);
  canvas.height = Math.round(image.height * ratio);
  canvas.getContext("2d")?.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.76);
}
