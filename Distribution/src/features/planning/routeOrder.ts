import type { DistributionRoute, RouteStop } from "@/shared/types/distribution";

export function canReorderRouteStops(
  route: Pick<DistributionRoute, "lifecycle" | "acknowledged">,
  stopCount = 0,
) {
  return !route.acknowledged && (route.lifecycle === "Brouillon" || route.lifecycle === "Publiée") && stopCount > 1;
}

export function reorderStops(stops: RouteStop[], source: number, target: number): RouteStop[] {
  if (source < 0 || target < 0 || source >= stops.length || target >= stops.length || source === target) return stops;
  const reordered = [...stops];
  const [moved] = reordered.splice(source, 1);
  reordered.splice(target, 0, moved);
  return reordered.map((stop, index) => ({ ...stop, sequence: index + 1 }));
}

export function orderedDeliveryNotes(stops: RouteStop[]) {
  return stops.map((stop) => stop.deliveryNote);
}

export function sameStopOrder(left: RouteStop[], right: RouteStop[]) {
  return orderedDeliveryNotes(left).join("\0") === orderedDeliveryNotes(right).join("\0");
}
