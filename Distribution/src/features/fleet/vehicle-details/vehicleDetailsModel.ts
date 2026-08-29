import { calendarDaysUntil } from "@/shared/format";
import type { StatusTone } from "@/shared/design/statusTone";
import type { FleetDocument, FleetVehicle } from "@/shared/types/distribution";

export const ROUTE_PREVIEW_LIMIT = 5;

export function personInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("fr") || "")
    .join("");
}

export function vehicleMetaLine(vehicle: Pick<FleetVehicle, "fuelType" | "company">) {
  return [vehicle.fuelType, vehicle.company].filter(Boolean).join(" · ");
}

export function relativeDayLabel(days: number) {
  if (days === 0) return "Aujourd’hui";
  if (days === 1) return "Dans 1 jour";
  if (days > 1) return `Dans ${days} jours`;
  if (days === -1) return "En retard de 1 jour";
  return `En retard de ${Math.abs(days)} jours`;
}

export function maintenanceProximity(nextMaintenance?: string | null, todayValue?: string) {
  if (!nextMaintenance) return null;
  const days = calendarDaysUntil(nextMaintenance, todayValue);
  if (days == null) return null;
  let tone: StatusTone = "success";
  if (days < 0) tone = "danger";
  else if (days <= 30) tone = "warning";
  return { days, label: relativeDayLabel(days), tone };
}

export function summarizeVehicleDocuments(documents: FleetDocument[]) {
  return {
    valid: documents.filter((doc) => doc.alert === "valid").length,
    expiring: documents.filter((doc) => doc.alert === "expiring").length,
    blocked: documents.filter((doc) => doc.alert === "expired" || doc.alert === "missing").length,
    total: documents.length,
  };
}

export function hasMetricValue(value?: number | null) {
  return value != null && value !== 0;
}
