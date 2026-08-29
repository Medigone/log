import { describe, expect, it } from "vitest";
import { customerLabel, locationLabel, routeCardFromRoute } from "@/features/driver/routeCard";
import type { DistributionRoute, RouteStop } from "@/shared/types/distribution";

function stop(overrides: Partial<RouteStop> & Pick<RouteStop, "deliveryNote" | "customerName" | "status" | "sequence">): RouteStop {
  return {
    customer: "CUST-1",
    customerGpsStatus: "known",
    requiresCustomerGeolocation: false,
    address: "1 rue A",
    phone: "0550000000",
    totalQuantity: 2,
    amountCollected: 0,
    amountToCollect: 12000,
    payments: [],
    invoiceStatus: "Non créée",
    planningStatus: "Planifié",
    ...overrides,
  };
}

function route(overrides: Partial<DistributionRoute> = {}): DistributionRoute {
  return {
    name: "LIV-1",
    date: "2026-08-25",
    lifecycle: "En cours",
    plannedStart: "2026-08-25 08:00:00",
    plannedEnd: "2026-08-25 16:00:00",
    revision: 3,
    publishedRevision: 3,
    acknowledgedRevision: 3,
    acknowledged: true,
    needsReview: false,
    totalQuantity: 4,
    totalArticles: 12,
    totalCollected: 0,
    totalAmount: 18000,
    alerts: [],
    routing: {
      status: "ready",
      provider: "openrouteservice",
      profile: "driving-car",
      optimizationEnabled: true,
      distanceMeters: 12000,
      durationSeconds: 1800,
      stopDurationMinutes: 15,
      stopDurationSeconds: 900,
      totalDurationSeconds: 2700,
      geometry: { type: "LineString", coordinates: [] },
      revision: 3,
    },
    stock: { status: "Chargé", loadedQuantity: 4, deliveredQuantity: 2, remainingQuantity: 2, returnedQuantity: 0, lines: [] },
    cash: { routeId: "LIV-1", routeLifecycle: "En cours", status: "Sans encaissement", declaredCash: 0, declaredCheques: 0, declaredTotal: 0, countedTotal: 0, validatedTotal: 0, payments: [] },
    stops: [
      stop({ deliveryNote: "DN-1", customerName: "Client A", commune: "Hydra", wilaya: "Alger", status: "Livré", sequence: 1 }),
      stop({ deliveryNote: "DN-2", customerName: "Épicerie Nord", commune: "El Biar", wilaya: "Alger", status: "Enlevé", sequence: 2 }),
    ],
    ...overrides,
  };
}

describe("routeCard", () => {
  it("tronque les clients après le premier nom", () => {
    expect(customerLabel(["Client A"])).toBe("Client A");
    expect(customerLabel(["Client A", "Client B", "Client A"])).toBe("Client A · +1");
    expect(customerLabel([])).toBe("Client non renseigné");
  });

  it("agrège commune et wilaya uniques", () => {
    expect(locationLabel(["Hydra"], ["Alger"])).toBe("Hydra · Alger");
    expect(locationLabel(["Hydra", "El Biar"], ["Alger", "Alger"])).toBe("Hydra, El Biar · Alger");
  });

  it("dérive une carte depuis une tournée complète", () => {
    const card = routeCardFromRoute(route());
    expect(card.customerLabel).toBe("Client A · +1");
    expect(card.stopCount).toBe(2);
    expect(card.totalArticles).toBe(12);
    expect(card.locationLabel).toBe("Hydra, El Biar · Alger");
    expect(card.lifecycle).toBe("En cours");
  });
});
