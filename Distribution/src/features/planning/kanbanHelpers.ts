import {
  closestCorners,
  pointerWithin,
  rectIntersection,
  type CollisionDetection,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import type {
  DeliveryNoteAssignment,
  DistributionRoute,
  PlanningResource,
} from "@/shared/types/distribution";
import type { KanbanColumn, KanbanValue } from "@/components/reui/kanban";

export const BACKLOG_COLUMN_ID = "__backlog__";
export const ROUTE_COLUMN_PREFIX = "route:";
export const NEW_ROUTE_COLUMN_PREFIX = "new:";

export function routeColumnId(routeName: string) {
  return `${ROUTE_COLUMN_PREFIX}${routeName}`;
}

export function parseRouteColumnId(columnId: string | null | undefined): string | null {
  if (!columnId || !columnId.startsWith(ROUTE_COLUMN_PREFIX)) return null;
  return columnId.slice(ROUTE_COLUMN_PREFIX.length) || null;
}

export function newRouteColumnId(driverName: string) {
  return `${NEW_ROUTE_COLUMN_PREFIX}${driverName}`;
}

export function parseNewRouteColumnId(columnId: string | null | undefined): string | null {
  if (!columnId || !columnId.startsWith(NEW_ROUTE_COLUMN_PREFIX)) return null;
  return columnId.slice(NEW_ROUTE_COLUMN_PREFIX.length) || null;
}

export function preferNewRouteCollisions<T extends { id: UniqueIdentifier }>(hits: T[]): T[] {
  const create = hits.find((hit) => String(hit.id).startsWith(NEW_ROUTE_COLUMN_PREFIX));
  return create ? [create] : hits;
}

/** Pointer-first detection so an empty “Nouvelle tournée” zone wins over the larger route above it. */
export const planningCollisionDetection: CollisionDetection = (args) => {
  const pointerHits = pointerWithin(args);
  const hits = pointerHits.length > 0 ? pointerHits : rectIntersection(args);
  if (hits.length === 0) return closestCorners(args);
  return preferNewRouteCollisions(hits);
};

export interface KanbanBLItem {
  id: string;
  columnId: string;
  assignment: DeliveryNoteAssignment;
}

export interface KanbanBacklogColumn extends KanbanColumn {
  id: typeof BACKLOG_COLUMN_ID;
}

export function listActiveDrivers(drivers: PlanningResource[]) {
  return [...drivers]
    .filter((driver) => driver.active)
    .sort((a, b) => a.label.localeCompare(b.label, "fr"));
}

export function routesForDriver(routes: DistributionRoute[], driverId: string, date: string) {
  return routes
    .filter((route) => route.driver === driverId && route.date === date)
    .sort((a, b) => (a.plannedStart ?? "").localeCompare(b.plannedStart ?? ""));
}

/**
 * Droppables: backlog, one per route of the day, and a "new route" zone per active driver.
 * Assigned BLs sit in their route column.
 */
export function buildKanbanValue(
  assignments: DeliveryNoteAssignment[],
  routes: DistributionRoute[],
  drivers: PlanningResource[],
): KanbanValue<KanbanBLItem> {
  const activeDrivers = listActiveDrivers(drivers);
  const routeByName = new Map(routes.map((route) => [route.name, route]));

  const columns: KanbanColumn[] = [
    { id: BACKLOG_COLUMN_ID } as KanbanBacklogColumn,
    ...routes.map((route) => ({ id: routeColumnId(route.name) })),
    ...activeDrivers.map((driver) => ({ id: newRouteColumnId(driver.name) })),
  ];

  const items: KanbanBLItem[] = assignments.map((assignment) => {
    const route = assignment.route ? routeByName.get(assignment.route) : undefined;
    const columnId = route ? routeColumnId(route.name) : BACKLOG_COLUMN_ID;
    return { id: assignment.deliveryNote, columnId, assignment };
  });

  return { columns, items };
}

export function isItemDraggable(item: KanbanBLItem, routes: DistributionRoute[]): boolean {
  if (!item.assignment.route) return true;
  const route = routes.find((entry) => entry.name === item.assignment.route);
  if (!route) return true;
  return route.lifecycle === "Brouillon";
}

export function isRouteLocked(route: DistributionRoute) {
  return route.lifecycle !== "Brouillon";
}

/** Totals for a set of BL cards: count and summed articles. */
export function columnLoad(items: KanbanBLItem[]) {
  return {
    blCount: items.length,
    articleCount: items.reduce((sum, item) => sum + (Number(item.assignment.totalQuantity) || 0), 0),
  };
}

export function vehicleLabelFor(
  vehicleId: string | undefined,
  vehicles: PlanningResource[],
): string | undefined {
  if (!vehicleId) return undefined;
  return vehicles.find((vehicle) => vehicle.name === vehicleId)?.label;
}
