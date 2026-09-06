import { describe, expect, it } from "vitest";
import {
  flattenLocationGroups,
  groupStopsByLocation,
  locationGroupKey,
  UNKNOWN_COMMUNE,
  UNKNOWN_WILAYA,
} from "@/features/planning/routeStopGroups";
import type { RouteStop } from "@/shared/types/distribution";

function stop(overrides: Partial<RouteStop> & Pick<RouteStop, "deliveryNote" | "sequence">): RouteStop {
  return {
    customer: "C",
    customerName: overrides.customerName || overrides.deliveryNote,
    customerGpsStatus: "known",
    requiresCustomerGeolocation: false,
    totalQuantity: 1,
    amountCollected: 0,
    amountToCollect: 0,
    payments: [],
    invoiceStatus: "Non créée",
    status: "Préparé",
    planningStatus: "Planifié",
    ...overrides,
  };
}

describe("groupStopsByLocation", () => {
  it("regroupe par wilaya puis commune en collant les arrêts d’une même zone", () => {
    const stops = [
      stop({ deliveryNote: "A", sequence: 1, commune: "Oran", wilaya: "Oran" }),
      stop({ deliveryNote: "B", sequence: 2, commune: "Bir El Djir", wilaya: "Oran" }),
      stop({ deliveryNote: "C", sequence: 3, commune: "Oran", wilaya: "Oran" }),
      stop({ deliveryNote: "D", sequence: 4, commune: "Hussein Dey", wilaya: "Alger" }),
    ];

    const groups = groupStopsByLocation(stops);
    expect(groups.map((group) => group.wilaya)).toEqual(["Oran", "Alger"]);
    expect(groups[0].communes.map((commune) => commune.commune)).toEqual(["Oran", "Bir El Djir"]);
    expect(groups[0].communes[0].stops.map((item) => item.deliveryNote)).toEqual(["A", "C"]);
    expect(flattenLocationGroups(groups).map((item) => item.deliveryNote)).toEqual(["A", "C", "B", "D"]);
  });

  it("étiquette les arrêts sans commune ni wilaya", () => {
    const stops = [stop({ deliveryNote: "X", sequence: 1 })];
    const groups = groupStopsByLocation(stops);
    expect(groups[0].wilaya).toBe(UNKNOWN_WILAYA);
    expect(groups[0].communes[0].commune).toBe(UNKNOWN_COMMUNE);
    expect(locationGroupKey(stops[0])).toBe(`${UNKNOWN_WILAYA}\0${UNKNOWN_COMMUNE}`);
  });
});
