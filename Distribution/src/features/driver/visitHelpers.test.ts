import { describe, expect, it } from "vitest";
import type { RouteStop } from "@/shared/types/distribution";
import {
  collapseStopsByCustomer,
  groupStopsIntoVisits,
  itemGroups,
  remainingVisits,
  uniqueVisitCount,
  visitNotesLabel,
  visitStatus,
} from "@/features/driver/visitHelpers";

function stop(overrides: Partial<RouteStop> & Pick<RouteStop, "deliveryNote">): RouteStop {
  return {
    customer: "C-A",
    customerName: "Alpha",
    customerGpsStatus: "known",
    requiresCustomerGeolocation: false,
    totalQuantity: 1,
    amountCollected: 0,
    amountToCollect: 100,
    payments: [],
    invoiceStatus: "Non créée",
    status: "Enlevé",
    planningStatus: "Planifié",
    sequence: 1,
    ...overrides,
  };
}

describe("visitHelpers", () => {
  it("regroupe les BL d’un même client en une visite", () => {
    const visits = groupStopsIntoVisits([
      stop({ deliveryNote: "DN-1", sequence: 1, grandTotal: 100, amountToCollect: 100 }),
      stop({ deliveryNote: "DN-2", sequence: 2, grandTotal: 50, amountToCollect: 50, payments: [{ name: "PAY-1", method: "Espèce", amount: 20, status: "Déclaré" }] }),
      stop({ deliveryNote: "DN-3", customer: "C-B", customerName: "Beta", sequence: 3, grandTotal: 80, amountToCollect: 80 }),
    ]);
    expect(visits.map((visit) => visit.visitKey)).toEqual(["C-A", "C-B"]);
    expect(visits[0].deliveryNotes).toEqual(["DN-1", "DN-2"]);
    expect(visits[0].grandTotal).toBe(150);
    expect(visits[0].amountCollected).toBe(20);
    expect(visits[0].amountToCollect).toBe(130);
    expect(visitNotesLabel(visits[0])).toBe("2 BL");
    expect(remainingVisits(visits)).toHaveLength(2);
  });

  it("agrège le statut de visite", () => {
    expect(visitStatus(["Livré", "Livré"])).toBe("Livré");
    expect(visitStatus(["Livré", "Non Livré"])).toBe("Partiellement Livré");
    expect(visitStatus(["Livré", "Enlevé"])).toBe("Enlevé");
  });

  it("groupe les articles par BL", () => {
    const groups = itemGroups(
      stop({
        deliveryNote: "DN-1",
        deliveryNotes: ["DN-1", "DN-2"],
        items: [
          { name: "I-1", itemCode: "A", itemName: "Huile", quantity: 1, deliveredQuantity: 0, remainingQuantity: 1, deliveryNote: "DN-1" },
          { name: "I-2", itemCode: "B", itemName: "Lait", quantity: 2, deliveredQuantity: 0, remainingQuantity: 2, deliveryNote: "DN-2" },
        ],
      }),
    );
    expect(groups.map((group) => [group.deliveryNote, group.items.length])).toEqual([
      ["DN-1", 1],
      ["DN-2", 1],
    ]);
  });

  it("compte les visites uniques et recoller les BL d’un même client", () => {
    const stops = [
      stop({ deliveryNote: "DN-1", customer: "C-A", sequence: 1 }),
      stop({ deliveryNote: "DN-3", customer: "C-B", sequence: 2 }),
      stop({ deliveryNote: "DN-2", customer: "C-A", sequence: 3 }),
    ];
    expect(uniqueVisitCount(stops)).toBe(2);
    expect(collapseStopsByCustomer(stops).map((item) => item.deliveryNote)).toEqual(["DN-1", "DN-2", "DN-3"]);
  });
});
