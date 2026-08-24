import type { RouteStop } from "@/shared/types/distribution";

export function reorderStops(stops: RouteStop[], source: number, target: number): RouteStop[] {
  if (source < 0 || target < 0 || source >= stops.length || target >= stops.length || source === target) return stops;
  const reordered = [...stops];
  const [moved] = reordered.splice(source, 1);
  reordered.splice(target, 0, moved);
  return reordered.map((stop, index) => ({ ...stop, sequence: index + 1 }));
}
