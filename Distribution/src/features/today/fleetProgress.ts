import { getStopVisualStyle } from "@/features/planning/stopStatus";
import type { ActivityLiveRoute, ActivityLiveStop, DistributionException, RouteLifecycle } from "@/shared/types/distribution";

export const LIVE_ROUTE_STATES: RouteLifecycle[] = ["Publiée", "En cours", "Retour dépôt"];

export const FLEET_COLORS = ["#18181b", "#0f766e", "#7c3aed", "#c2410c", "#52525b", "#15803d"];

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

type ProgressRoute = Pick<ActivityLiveRoute, "lifecycle" | "stops" | "visits" | "depot"> & {
  alerts?: string[];
  vehicleLabel?: string | null;
  driverName?: string | null;
  name: string;
};

export function isLiveRoute(route: { lifecycle: RouteLifecycle | string }) {
  return LIVE_ROUTE_STATES.includes(route.lifecycle as RouteLifecycle);
}

export function routeStopCounts(routes: Array<{ visits?: Array<{ status: string }>; stops: Array<{ status: string }> }>) {
  const stops = routes.flatMap((route) => mapStops(route));
  const state = (status: string) => getStopVisualStyle(status).state;
  return {
    total: stops.length,
    delivered: stops.filter((stop) => state(stop.status) === "delivered").length,
    failed: stops.filter((stop) => state(stop.status) === "failed").length,
    pending: stops.filter((stop) => state(stop.status) === "pending").length,
  };
}

function parseFrappeDate(value: string) {
  return new Date(value.includes("T") ? value : value.replace(" ", "T"));
}

/** Tournée publiée dont l’heure de départ prévue est dépassée, sans passage « En cours ». */
export function lateDeparture(
  route: { lifecycle: RouteLifecycle | string; plannedStart?: string | null; startedAt?: string | null },
  now = new Date(),
) {
  if (route.lifecycle !== "Publiée" || route.startedAt || !route.plannedStart) return false;
  const planned = parseFrappeDate(route.plannedStart);
  return !Number.isNaN(planned.getTime()) && planned.getTime() < now.getTime();
}

export function plural(count: number, singular: string, pluralForm?: string) {
  return `${count} ${count > 1 ? pluralForm ?? `${singular}s` : singular}`;
}

export function fleetColor(index: number) {
  return FLEET_COLORS[index % FLEET_COLORS.length];
}

export function mapStops<T>(route: { visits?: T[]; stops: T[] }): T[] {
  return route.visits?.length ? route.visits : route.stops;
}

export function stopProgress(route: { visits?: Array<{ status: string }>; stops: Array<{ status: string }> }): RouteProgress {
  const stops = mapStops(route);
  const total = stops.length;
  const done = stops.filter((stop) => getStopVisualStyle(stop.status).processed).length;
  const failed = stops.filter((stop) => getStopVisualStyle(stop.status).state === "failed").length;
  return {
    total,
    done,
    failed,
    remaining: Math.max(0, total - done),
    percent: total ? Math.round((done / total) * 100) : 0,
  };
}

export function nextPendingStop(route: { visits?: ActivityLiveStop[]; stops: ActivityLiveStop[] }): ActivityLiveStop | undefined {
  return [...mapStops(route)]
    .sort((left, right) => left.sequence - right.sequence)
    .find((stop) => !getStopVisualStyle(stop.status).processed);
}

export function lastProcessedStop(route: { visits?: ActivityLiveStop[]; stops: ActivityLiveStop[] }): ActivityLiveStop | undefined {
  return [...mapStops(route)]
    .filter((stop) => getStopVisualStyle(stop.status).processed)
    .sort((left, right) => left.sequence - right.sequence)
    .at(-1);
}

function pointFromStop(stop?: { latitude?: number | null; longitude?: number | null }): MapPoint | null {
  if (stop?.latitude == null || stop.longitude == null) return null;
  return [stop.latitude, stop.longitude];
}

export const TRAVELED_PATH_COLOR = "#16a34a";

function nearestLineIndex(line: MapPoint[], target: MapPoint) {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = 0; index < line.length; index += 1) {
    const point = line[index];
    const distance = (point[0] - target[0]) ** 2 + (point[1] - target[1]) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = index;
    }
  }
  return best;
}

/** Découpe le tracé GPS : vert jusqu’au dernier arrêt enregistré, couleur tournée pour le reste. */
export function splitTraveledPath(
  line: MapPoint[],
  lastProcessed: MapPoint | null,
  fullyTraveled = false,
): { traveled: MapPoint[]; remaining: MapPoint[] } {
  if (line.length < 2) return { traveled: [], remaining: line };
  if (fullyTraveled) return { traveled: line, remaining: [] };
  if (!lastProcessed) return { traveled: [], remaining: line };
  const index = nearestLineIndex(line, lastProcessed);
  if (index <= 0) return { traveled: [], remaining: line };
  if (index >= line.length - 1) return { traveled: line, remaining: [] };
  const split = line[index];
  return {
    traveled: line.slice(0, index + 1),
    remaining: [split, ...line.slice(index + 1)],
  };
}

/** Camion sur la carte : terrain seulement. Un brouillon ou une tournée terminée n’en a pas. */
export function vehiclePosition(route: ProgressRoute): MapPoint | null {
  if (route.lifecycle === "En cours") {
    return (
      pointFromStop(lastProcessedStop(route) || nextPendingStop(route))
      || (route.depot ? [route.depot.latitude, route.depot.longitude] : null)
    );
  }
  if (route.lifecycle === "Publiée" || route.lifecycle === "Retour dépôt") {
    return route.depot ? [route.depot.latitude, route.depot.longitude] : null;
  }
  return null;
}

export function collectDashboardAlerts(
  routes: ProgressRoute[],
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
    for (const stop of mapStops(route)) {
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
