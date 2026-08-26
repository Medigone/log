import { getStopVisualStyle } from "@/features/planning/stopStatus";
import type { DistributionException, DistributionRoute, RouteLifecycle, RouteStop } from "@/shared/types/distribution";

export const LIVE_ROUTE_STATES: RouteLifecycle[] = ["Publiée", "En cours", "Retour dépôt"];

export const FLEET_COLORS = ["#457b9d", "#0f766e", "#7c3aed", "#c2410c", "#0369a1", "#15803d"];

export type MapPoint = [number, number];

export interface RouteProgress {
  total: number;
  done: number;
  failed: number;
  remaining: number;
  percent: number;
}

export interface DashboardAlert {
  id: string;
  tone: "danger" | "warning" | "info";
  title: string;
  detail: string;
  target?: string;
}

export function isLiveRoute(route: DistributionRoute) {
  return LIVE_ROUTE_STATES.includes(route.lifecycle);
}

export function fleetColor(index: number) {
  return FLEET_COLORS[index % FLEET_COLORS.length];
}

export function stopProgress(route: DistributionRoute): RouteProgress {
  const total = route.stops.length;
  const done = route.stops.filter((stop) => getStopVisualStyle(stop.status).processed).length;
  const failed = route.stops.filter((stop) => getStopVisualStyle(stop.status).state === "failed").length;
  return {
    total,
    done,
    failed,
    remaining: Math.max(0, total - done),
    percent: total ? Math.round((done / total) * 100) : 0,
  };
}

export function nextPendingStop(route: DistributionRoute): RouteStop | undefined {
  return [...route.stops]
    .sort((left, right) => left.sequence - right.sequence)
    .find((stop) => !getStopVisualStyle(stop.status).processed);
}

export function lastProcessedStop(route: DistributionRoute): RouteStop | undefined {
  return [...route.stops]
    .filter((stop) => getStopVisualStyle(stop.status).processed)
    .sort((left, right) => left.sequence - right.sequence)
    .at(-1);
}

function pointFromStop(stop?: RouteStop): MapPoint | null {
  if (stop?.latitude == null || stop.longitude == null) return null;
  return [stop.latitude, stop.longitude];
}

/** Position affichée du véhicule : prochain arrêt, dernier traité, sinon dépôt. */
export function vehiclePosition(route: DistributionRoute): MapPoint | null {
  if (route.lifecycle === "Retour dépôt" && route.depot) {
    return [route.depot.latitude, route.depot.longitude];
  }
  return (
    pointFromStop(route.lifecycle === "En cours" ? lastProcessedStop(route) || nextPendingStop(route) : nextPendingStop(route))
    || (route.depot ? [route.depot.latitude, route.depot.longitude] : null)
  );
}

export function collectDashboardAlerts(
  routes: DistributionRoute[],
  exceptions: DistributionException[],
): DashboardAlert[] {
  const alerts: DashboardAlert[] = exceptions.map((exception) => ({
    id: exception.name,
    tone: exception.priorite === "Haute" || exception.priorite === "Critique" ? "danger" : "warning",
    title: exception.type_exception || "Exception",
    detail: exception.description || exception.bon_de_livraison,
    target: exception.tournee ? `/planning/routes/${exception.tournee}` : "/deliveries",
  }));

  for (const route of routes) {
    for (const message of route.alerts || []) {
      alerts.push({
        id: `${route.name}-alert-${message}`,
        tone: "warning",
        title: route.vehicleLabel || route.driverName || route.name,
        detail: message,
        target: `/planning/routes/${route.name}`,
      });
    }
    for (const stop of route.stops) {
      if (getStopVisualStyle(stop.status).state !== "failed") continue;
      alerts.push({
        id: `${route.name}-${stop.deliveryNote}`,
        tone: "danger",
        title: `Échec · ${stop.customerName}`,
        detail: `${stop.deliveryNote} · ${route.driverName || route.name}`,
        target: `/planning/routes/${route.name}`,
      });
    }
  }

  return alerts.slice(0, 8);
}
