import { describe, expect, it } from "vitest";
import type { DistributionRoute, RouteStop } from "@/shared/types/distribution";
import {
  collectDashboardAlerts,
  isLiveRoute,
  lateDeparture,
  routeStopCounts,
  splitTraveledPath,
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

  it("n’affiche pas le camion sur le premier client d’une tournée brouillon", () => {
    const draft = route({
      lifecycle: "Brouillon",
      depot: { name: "DEPOT", label: "Dépôt Principal", latitude: 35.67, longitude: -0.66, isDefault: true },
      stops: [stop({ deliveryNote: "DN-1", status: "Préparé", sequence: 1, latitude: 36.76, longitude: 3.05 })],
    });
    expect(vehiclePosition(draft)).toBeNull();
  });

  it("garde le camion au dépôt tant que la tournée n’est pas partie", () => {
    const published = route({
      lifecycle: "Publiée",
      depot: { name: "DEPOT", label: "Dépôt Principal", latitude: 35.67, longitude: -0.66, isDefault: true },
      stops: [stop({ deliveryNote: "DN-1", status: "Préparé", sequence: 1, latitude: 36.76, longitude: 3.05 })],
    });
    expect(vehiclePosition(published)).toEqual([35.67, -0.66]);
  });

  it("n’affiche plus le camion une fois la tournée terminée", () => {
    const done = route({
      lifecycle: "Terminée",
      depot: { name: "DEPOT", label: "Dépôt Principal", latitude: 35.67, longitude: -0.66, isDefault: true },
    });
    expect(vehiclePosition(done)).toBeNull();
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

  it("découpe le tracé au dernier arrêt enregistré", () => {
    const line: [number, number][] = [
      [36.7, 3.0],
      [36.71, 3.01],
      [36.72, 3.02],
      [36.73, 3.03],
    ];
    expect(splitTraveledPath(line, null).traveled).toEqual([]);
    expect(splitTraveledPath(line, [36.72, 3.02]).traveled).toHaveLength(3);
    expect(splitTraveledPath(line, [36.72, 3.02]).remaining[0]).toEqual([36.72, 3.02]);
    expect(splitTraveledPath(line, [36.73, 3.03], true).remaining).toEqual([]);
  });

  it("compte les arrêts livrés et détecte un départ en retard", () => {
    expect(routeStopCounts([route()])).toEqual({ total: 2, delivered: 1, failed: 0, pending: 1 });
    expect(
      lateDeparture(
        route({ lifecycle: "Publiée", plannedStart: "2000-01-01T07:30:00", startedAt: undefined }),
        new Date("2026-09-05T10:00:00"),
      ),
    ).toBe(true);
    expect(
      lateDeparture(
        route({ lifecycle: "En cours", plannedStart: "2000-01-01T07:30:00" }),
        new Date("2026-09-05T10:00:00"),
      ),
    ).toBe(false);
  });

  it("compte les visites quand la tournée les fournit", () => {
    const current = route({
      visits: [
        stop({ deliveryNote: "DN-1", status: "Livré", sequence: 1, deliveryNotes: ["DN-1", "DN-2"] }),
      ],
    });
    expect(stopProgress(current)).toEqual({ total: 1, done: 1, failed: 0, remaining: 0, percent: 100 });
    expect(routeStopCounts([current])).toEqual({ total: 1, delivered: 1, failed: 0, pending: 0 });
  });
});
