import type { DocumentAlert, FleetDocument, FleetOption } from "@/shared/types/distribution";

export function documentAlertLabel(alert?: DocumentAlert | string | null) {
  if (alert === "expired") return "Expiré";
  if (alert === "expiring") return "Bientôt";
  if (alert === "valid") return "À jour";
  if (alert === "missing") return "Manquant";
  if (alert === "due") return "À faire";
  if (alert === "upcoming") return "Proche";
  return "—";
}

export function licenseLabel(document: FleetDocument) {
  if (document.alert === "expired") return "Permis expiré";
  if (document.alert === "expiring") return "Permis bientôt expiré";
  if (document.url) return "Permis à jour";
  return "Permis manquant";
}

export function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function matchesQuery(values: Array<string | null | undefined>, query: string) {
  if (!query) return true;
  return values.filter(Boolean).some((value) => String(value).toLocaleLowerCase("fr").includes(query));
}

export function fleetOptionLabel(option: FleetOption, mode: "vehicle" | "driver") {
  if (mode === "vehicle") {
    return option.driverName ? `${option.label} · ${option.driverName}` : `${option.label} · Libre`;
  }
  return option.vehicleLabel ? `${option.label} · ${option.vehicleLabel}` : `${option.label} · Sans véhicule`;
}

export function vehicleDisplayName(vehicle: { nom?: string | null; label: string; registration?: string | null }) {
  if (vehicle.nom) return vehicle.nom;
  const plate = vehicle.registration;
  if (plate && vehicle.label.endsWith(` · ${plate}`)) {
    return vehicle.label.slice(0, -(plate.length + 3));
  }
  return vehicle.label;
}
