import { getStopVisualStyle } from "@/features/planning/stopStatus";
import { formatTime } from "@/shared/format";
import type { DistributionRoute } from "@/shared/types/distribution";

export interface RouteEvent {
  label: string;
  age?: string;
  time?: string;
  stamp?: string;
  at?: number;
  tone: "danger" | "warning" | "ok" | "neutral";
}

function parseStamp(value?: string | null) {
  if (!value) return undefined;
  const date = new Date(value.includes("T") ? value : value.replace(" ", "T"));
  return Number.isNaN(date.getTime()) ? undefined : date.getTime();
}

export function formatEventAge(value: string, now = Date.now()) {
  const at = parseStamp(value);
  if (at == null) return undefined;
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 1) return "à l’instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return `il y a ${days} j`;
}

function eventClock(stamp?: string) {
  if (!stamp) return undefined;
  const time = formatTime(stamp);
  return time === "—" ? undefined : time;
}

function withAge(event: Omit<RouteEvent, "age" | "time"> & { stamp?: string }): RouteEvent {
  return {
    ...event,
    age: event.stamp ? formatEventAge(event.stamp) : undefined,
    time: eventClock(event.stamp),
    at: parseStamp(event.stamp) ?? event.at,
  };
}

/** Dernier événement terrain dérivé des arrêts et des horodatages de tournée. */
export function lastRouteEvent(route: DistributionRoute, now = Date.now()): RouteEvent | undefined {
  return routeEvents(route, now)[0];
}

export function routeEvents(route: DistributionRoute, now = Date.now()): RouteEvent[] {
  const events: RouteEvent[] = [];

  if (route.finishedAt) {
    events.push(withAge({ label: "Tournée terminée", tone: "ok", stamp: route.finishedAt, at: now }));
  }
  if (route.startedAt) {
    events.push(withAge({ label: "Départ confirmé", tone: "ok", stamp: route.startedAt, at: now }));
  }

  for (const stop of route.stops) {
    const state = getStopVisualStyle(stop.status).state;
    if (state === "failed") {
      events.push(
        withAge({
          label: `Échec · ${stop.customerName}`,
          tone: "danger",
          stamp: stop.completedAt,
          at: stop.sequence,
        }),
      );
    } else if (state === "delivered" || state === "partial") {
      events.push(
        withAge({
          label: `${state === "partial" ? "Partiel" : "Livré"} · ${stop.customerName}`,
          tone: state === "partial" ? "warning" : "ok",
          stamp: stop.completedAt,
          at: stop.sequence,
        }),
      );
    }
  }

  for (const message of route.alerts || []) {
    events.push({ label: message, tone: "warning", at: 0 });
  }

  return events.sort((left, right) => (right.at ?? 0) - (left.at ?? 0));
}

export function hasRouteEvents(routes: DistributionRoute[]) {
  return routes.some((route) => lastRouteEvent(route));
}
