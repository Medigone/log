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

export function canDeleteDraftRoute(route: Pick<DistributionRoute, "lifecycle" | "stops">) {
  return route.lifecycle === "Brouillon" && (route.stops?.length ?? 0) === 0;
}

/** Totals for a set of BL cards: count and summed articles. */
export function columnLoad(items: KanbanBLItem[]) {
  return {
    blCount: items.length,
    articleCount: items.reduce((sum, item) => sum + (Number(item.assignment.totalQuantity) || 0), 0),
  };
}

/** Vehicle (or driver) capacity when the API exposes it — never invent a default. */
export function resourceCapacity(driver: PlanningResource, vehicles: PlanningResource[]): number | undefined {
  const vehicle = vehicles.find((item) => item.name === driver.vehicle);
  const value = vehicle?.capacity ?? driver.capacity;
  return value && value > 0 ? value : undefined;
}

export function driverLoad(items: KanbanBLItem[], capacity?: number) {
  const { blCount, articleCount } = columnLoad(items);
  return {
    blCount,
    articleCount,
    pct: capacity ? Math.min(100, Math.round((articleCount / capacity) * 100)) : undefined,
  };
}

export function vehicleLabelFor(
  vehicleId: string | undefined,
  vehicles: PlanningResource[],
): string | undefined {
  if (!vehicleId) return undefined;
  return vehicles.find((vehicle) => vehicle.name === vehicleId)?.label;
}

/** When dragging one selected BL, the whole selection moves; otherwise the customer group, else only the dragged card. */
export function notesToMoveOnDrag(
  draggedDeliveryNote: string,
  selected: Iterable<string>,
  orderedIds: string[] = [],
  groupIds: string[] = [],
): string[] {
  const selectedSet = selected instanceof Set ? selected : new Set(selected);
  const orderedGroup = (ids: Iterable<string>) => {
    const wanted = ids instanceof Set ? ids : new Set(ids);
    const ordered = orderedIds.filter((id) => wanted.has(id));
    const missing = [...wanted].filter((id) => !ordered.includes(id));
    return ordered.length ? [...ordered, ...missing] : [...wanted];
  };
  if (selectedSet.size > 1 && selectedSet.has(draggedDeliveryNote)) {
    return orderedGroup(selectedSet);
  }
  if (groupIds.length > 1 && groupIds.includes(draggedDeliveryNote)) {
    return orderedGroup(groupIds);
  }
  return [draggedDeliveryNote];
}

export function clusterKanbanItemsByCustomer(items: KanbanBLItem[]) {
  const clusters: Array<{ key: string; customerName: string; items: KanbanBLItem[] }> = [];
  for (const item of items) {
    const key = item.assignment.customer || item.assignment.deliveryNote;
    const last = clusters.at(-1);
    if (last && last.key === key) {
      last.items.push(item);
      continue;
    }
    clusters.push({ key, customerName: item.assignment.customerName, items: [item] });
  }
  return clusters;
}
