import type { DistributionRoute, DriverRouteCard, RouteStop } from "@/shared/types/distribution";

export function uniqueLabels(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const value of values) {
    const label = (value || "").trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    labels.push(label);
  }
  return labels;
}

export function customerLabel(names: Array<string | null | undefined>): string {
  const labels = uniqueLabels(names);
  if (!labels.length) return "Client non renseigné";
  if (labels.length === 1) return labels[0];
  return `${labels[0]} · +${labels.length - 1}`;
}

export function locationLabel(
  communes: Array<string | null | undefined>,
  wilayas: Array<string | null | undefined>,
): string {
  const communePart = uniqueLabels(communes).join(", ");
  const wilayaPart = uniqueLabels(wilayas).join(", ");
  return [communePart, wilayaPart].filter(Boolean).join(" · ");
}

function stopArticleCount(stop: RouteStop): number {
  if (stop.items?.length) {
    return stop.items.reduce((sum, item) => sum + (item.quantity || 0), 0);
  }
  return stop.totalQuantity || 0;
}

export function routeCardFromRoute(route: DistributionRoute): DriverRouteCard {
  const totalArticles =
    route.totalArticles
    || route.stops.reduce((sum, stop) => sum + stopArticleCount(stop), 0);
  return {
    name: route.name,
    date: route.date,
    lifecycle: route.lifecycle,
    plannedStart: route.plannedStart,
    customerLabel: customerLabel(route.stops.map((stop) => stop.customerName)),
    stopCount: route.stops.length,
    totalArticles,
    locationLabel: locationLabel(
      route.stops.map((stop) => stop.commune),
      route.stops.map((stop) => stop.wilaya),
    ),
  };
}

export function formatRouteDate(value?: string | null): string {
  if (!value) return "";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
