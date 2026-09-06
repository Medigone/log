import type { RouteStop } from "@/shared/types/distribution";

export const UNKNOWN_WILAYA = "Sans wilaya";
export const UNKNOWN_COMMUNE = "Localisation non renseignée";

export function stopWilaya(stop: Pick<RouteStop, "wilaya">) {
  return stop.wilaya?.trim() || UNKNOWN_WILAYA;
}

export function stopCommune(stop: Pick<RouteStop, "commune">) {
  return stop.commune?.trim() || UNKNOWN_COMMUNE;
}

export function locationGroupKey(stop: Pick<RouteStop, "commune" | "wilaya">) {
  return `${stopWilaya(stop)}\0${stopCommune(stop)}`;
}

export interface CommuneGroup {
  wilaya: string;
  commune: string;
  key: string;
  stops: RouteStop[];
}

export interface WilayaGroup {
  wilaya: string;
  communes: CommuneGroup[];
}

/** Regroupe en conservant l’ordre de première apparition, puis la séquence dans chaque commune. */
export function groupStopsByLocation(stops: RouteStop[]): WilayaGroup[] {
  const wilayas: string[] = [];
  const communesByWilaya = new Map<string, string[]>();
  const buckets = new Map<string, RouteStop[]>();

  for (const stop of stops) {
    const wilaya = stopWilaya(stop);
    const commune = stopCommune(stop);
    const key = `${wilaya}\0${commune}`;
    if (!wilayas.includes(wilaya)) wilayas.push(wilaya);
    const communes = communesByWilaya.get(wilaya) ?? [];
    if (!communes.includes(commune)) {
      communes.push(commune);
      communesByWilaya.set(wilaya, communes);
    }
    const bucket = buckets.get(key);
    if (bucket) bucket.push(stop);
    else buckets.set(key, [stop]);
  }

  return wilayas.map((wilaya) => ({
    wilaya,
    communes: (communesByWilaya.get(wilaya) ?? []).map((commune) => {
      const key = `${wilaya}\0${commune}`;
      return { wilaya, commune, key, stops: buckets.get(key) ?? [] };
    }),
  }));
}

export function flattenLocationGroups(groups: WilayaGroup[]) {
  return groups.flatMap((group) => group.communes.flatMap((commune) => commune.stops));
}
