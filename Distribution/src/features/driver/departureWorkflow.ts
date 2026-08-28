import type { DistributionRoute, RouteStop } from "@/shared/types/distribution";
import { isStopCompleted } from "@/features/driver/stopHelpers";

export type ScanProposalKind = "unknown" | "acknowledge" | "verify" | "load" | "start" | "treat" | "done";

export interface ScanProposal {
  kind: ScanProposalKind;
  stop?: RouteStop;
  remaining?: number;
  verifiedNotes?: string[];
  message: string;
}

export function verificationStorageKey(routeId: string, revision: number) {
  return `intrapro-distribution.verified-bls.${routeId}.${revision}`;
}

export function readVerifiedNotes(routeId: string, revision: number): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(verificationStorageKey(routeId, revision)) || "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function writeVerifiedNotes(routeId: string, revision: number, notes: string[]) {
  localStorage.setItem(verificationStorageKey(routeId, revision), JSON.stringify(notes));
}

export function allStopsVerified(route: Pick<DistributionRoute, "stops">, verified: string[]) {
  const verifiedSet = new Set(verified);
  return route.stops.length > 0 && route.stops.every((stop) => verifiedSet.has(stop.deliveryNote));
}

function findScannedStop(route: Pick<DistributionRoute, "stops">, scanned: string) {
  const needle = scanned.trim().toLowerCase();
  return route.stops.find((stop) => stop.deliveryNote.toLowerCase() === needle);
}

export function proposeScanAction(route: DistributionRoute, scanned: string, verified: string[]): ScanProposal {
  const stop = findScannedStop(route, scanned);
  if (!stop) {
    return { kind: "unknown", message: "Ce bon ne fait pas partie de votre tournée active." };
  }

  if (route.lifecycle === "En cours") {
    if (isStopCompleted(stop)) {
      return { kind: "done", stop, message: `${stop.deliveryNote} est déjà ${stop.status}.` };
    }
    return { kind: "treat", stop, message: `Traitez ${stop.customerName}.` };
  }

  if (route.lifecycle !== "Publiée") {
    return { kind: "unknown", stop, message: "Ce bon n’est pas à traiter maintenant." };
  }

  if (!route.acknowledged) {
    return {
      kind: "acknowledge",
      stop,
      message: `Acceptez d’abord la révision ${route.publishedRevision}.`,
    };
  }

  if (route.stock.status === "Chargé") {
    return {
      kind: "start",
      stop,
      message: "Marchandise chargée. Démarrez la tournée pour livrer et encaisser.",
    };
  }

  const already = verified.includes(stop.deliveryNote);
  const nextVerified = already ? verified : [...verified, stop.deliveryNote];
  const remaining = route.stops.filter((item) => !nextVerified.includes(item.deliveryNote)).length;
  if (remaining === 0) {
    return {
      kind: "load",
      stop,
      verifiedNotes: nextVerified,
      message: "Tous les bons sont vérifiés. Confirmez le chargement du véhicule.",
    };
  }
  return {
    kind: "verify",
    stop,
    remaining,
    verifiedNotes: nextVerified,
    message: `BL vérifié, ${remaining} restant${remaining > 1 ? "s" : ""}.`,
  };
}
