import { describe, expect, it } from "vitest";
import type { DistributionRoute, RouteStop } from "@/shared/types/distribution";
import {
  collectDashboardAlerts,
  isLiveRoute,
  stopProgress,
  vehiclePosition,
} from "@/features/today/fleetProgress";

function stop(overrides: Partial<RouteStop> & Pick<RouteStop, "deliveryNote" | "status" | "sequence">): RouteStop {
  return {
    customer: "C-1",
    customerName: "Client 1",
    customerGpsStatus: "known",
    requiresCustomerGeolocation: false,
    totalQuantity: 1,
    amountCollected: 0,
    amountToCollect: 1000,
    payments: [],
    invoiceStatus: "Non créée",
    planningStatus: "En cours",
    latitude: 36.75,
    longitude: 3.04,
    ...overrides,
  };
}

function route(overrides: Partial<DistributionRoute> = {}): DistributionRoute {
  return {
    name: "LIV-1",
    date: "2026-08-26",
    lifecycle: "En cours",
    revision: 1,
    publishedRevision: 1,
    acknowledgedRevision: 1,
    acknowledged: true,
    needsReview: false,
    driverName: "Karim",
    vehicleLabel: "Camion A",
    totalQuantity: 3,
    totalCollected: 0,
    totalAmount: 3000,
    stops: [
      stop({ deliveryNote: "DN-1", status: "Livré", sequence: 1, latitude: 36.76, longitude: 3.05 }),
      stop({ deliveryNote: "DN-2", status: "Préparé", sequence: 2, latitude: 36.77, longitude: 3.06 }),
    ],
    routing: { status: "ready", provider: "openrouteservice", profile: "driving-car", optimizationEnabled: false },
    stock: { status: "Chargé", loadedQuantity: 2, deliveredQuantity: 1, remainingQuantity: 1, returnedQuantity: 0, lines: [] },
    cash: { routeId: "LIV-1", routeLifecycle: "En cours", status: "Sans encaissement", declaredCash: 0, declaredCheques: 0, declaredTotal: 0, countedTotal: 0, validatedTotal: 0, payments: [] },
    alerts: [],
    ...overrides,
  };
}

describe("fleetProgress", () => {
  it("compte les arrêts traités et place le véhicule sur le dernier livré", () => {
    const current = route();
    expect(isLiveRoute(current)).toBe(true);
    expect(stopProgress(current)).toEqual({ total: 2, done: 1, failed: 0, remaining: 1, percent: 50 });
    expect(vehiclePosition(current)).toEqual([36.76, 3.05]);
  });

  it("remonte les échecs terrain comme alertes", () => {
    const alerts = collectDashboardAlerts(
      [route({
        stops: [stop({ deliveryNote: "DN-9", status: "Non Livré", sequence: 1, customerName: "Client 9" })],
      })],
      [],
    );
    expect(alerts[0]).toMatchObject({ tone: "danger", title: "Échec · Client 9" });
  });
});
