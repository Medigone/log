import { describe, expect, it } from "vitest";
import { proposeScanAction } from "@/features/driver/departureWorkflow";
import type { DistributionRoute, RouteStop } from "@/shared/types/distribution";

function stop(overrides: Partial<RouteStop> & Pick<RouteStop, "deliveryNote" | "customerName" | "status">): RouteStop {
  return {
    customer: "CUST-1",
    customerGpsStatus: "known",
    requiresCustomerGeolocation: false,
    totalQuantity: 2,
    amountCollected: 0,
    amountToCollect: 1000,
    payments: [],
    invoiceStatus: "Non créée",
    planningStatus: "Planifié",
    sequence: 1,
    ...overrides,
  };
}

function route(overrides: Partial<DistributionRoute> & Pick<DistributionRoute, "lifecycle" | "stops" | "stock">): DistributionRoute {
  return {
    name: "LIV-1",
    date: "2026-08-28",
    plannedStart: "2026-08-28 08:00:00",
    plannedEnd: "2026-08-28 16:00:00",
    revision: 1,
    publishedRevision: 1,
    acknowledgedRevision: 1,
    acknowledged: true,
    needsReview: false,
    driver: "DRV-1",
    vehicle: "VEH-1",
    totalQuantity: 4,
    totalCollected: 0,
    totalAmount: 2000,
    alerts: [],
    routing: {
      status: "ready",
      provider: "openrouteservice",
      profile: "driving-car",
      optimizationEnabled: true,
    },
    cash: {
      routeId: "LIV-1",
      routeLifecycle: overrides.lifecycle,
      status: "Sans encaissement",
      declaredCash: 0,
      declaredCheques: 0,
      declaredTotal: 0,
      countedTotal: 0,
      validatedTotal: 0,
      payments: [],
    },
    ...overrides,
  };
}

const publishedStops = [
  stop({ deliveryNote: "DN-1", customerName: "Client A", status: "Préparé", sequence: 1 }),
  stop({ deliveryNote: "DN-2", customerName: "Client B", status: "Préparé", sequence: 2 }),
];

describe("proposeScanAction", () => {
  it("signale un BL hors tournée", () => {
    const proposal = proposeScanAction(
      route({ lifecycle: "Publiée", stock: { status: "À charger", loadedQuantity: 0, deliveredQuantity: 0, remainingQuantity: 0, returnedQuantity: 0, lines: [] }, stops: publishedStops }),
      "DN-999",
      [],
    );
    expect(proposal.kind).toBe("unknown");
    expect(proposal.message).toMatch(/ne fait pas partie/i);
  });

  it("exige d’accepter la révision avant de cocher", () => {
    const proposal = proposeScanAction(
      route({
        lifecycle: "Publiée",
        acknowledged: false,
        stock: { status: "À charger", loadedQuantity: 0, deliveredQuantity: 0, remainingQuantity: 0, returnedQuantity: 0, lines: [] },
        stops: publishedStops,
      }),
      "DN-1",
      [],
    );
    expect(proposal.kind).toBe("acknowledge");
    expect(proposal.message).toMatch(/acceptez d’abord la révision/i);
  });

  it("coche un BL non vérifié et indique le nombre restant", () => {
    const proposal = proposeScanAction(
      route({ lifecycle: "Publiée", stock: { status: "À charger", loadedQuantity: 0, deliveredQuantity: 0, remainingQuantity: 0, returnedQuantity: 0, lines: [] }, stops: publishedStops }),
      "DN-1",
      [],
    );
    expect(proposal.kind).toBe("verify");
    expect(proposal.remaining).toBe(1);
    expect(proposal.verifiedNotes).toEqual(["DN-1"]);
    expect(proposal.message).toBe("BL vérifié, 1 restant.");
  });

  it("propose le chargement après le dernier BL", () => {
    const proposal = proposeScanAction(
      route({ lifecycle: "Publiée", stock: { status: "À charger", loadedQuantity: 0, deliveredQuantity: 0, remainingQuantity: 0, returnedQuantity: 0, lines: [] }, stops: publishedStops }),
      "DN-2",
      ["DN-1"],
    );
    expect(proposal.kind).toBe("load");
    expect(proposal.verifiedNotes).toEqual(["DN-1", "DN-2"]);
    expect(proposal.message).toMatch(/confirmez le chargement/i);
  });

  it("propose le départ une fois le stock chargé", () => {
    const proposal = proposeScanAction(
      route({ lifecycle: "Publiée", stock: { status: "Chargé", loadedQuantity: 4, deliveredQuantity: 0, remainingQuantity: 4, returnedQuantity: 0, lines: [] }, stops: publishedStops }),
      "DN-1",
      ["DN-1", "DN-2"],
    );
    expect(proposal.kind).toBe("start");
    expect(proposal.message).toMatch(/démarrez la tournée/i);
  });

  it("ouvre le traitement d’un arrêt en cours", () => {
    const proposal = proposeScanAction(
      route({
        lifecycle: "En cours",
        stock: { status: "Chargé", loadedQuantity: 4, deliveredQuantity: 0, remainingQuantity: 4, returnedQuantity: 0, lines: [] },
        stops: [
          stop({ deliveryNote: "DN-8", customerName: "Épicerie Nord", status: "Enlevé", sequence: 1 }),
        ],
      }),
      "DN-8",
      [],
    );
    expect(proposal.kind).toBe("treat");
    expect(proposal.stop?.deliveryNote).toBe("DN-8");
  });

  it("n’ouvre pas l’assistant d’un BL déjà livré", () => {
    const proposal = proposeScanAction(
      route({
        lifecycle: "En cours",
        stock: { status: "Chargé", loadedQuantity: 4, deliveredQuantity: 2, remainingQuantity: 2, returnedQuantity: 0, lines: [] },
        stops: [
          stop({ deliveryNote: "DN-1", customerName: "Client A", status: "Livré", sequence: 1 }),
        ],
      }),
      "DN-1",
      [],
    );
    expect(proposal.kind).toBe("done");
    expect(proposal.message).toMatch(/déjà livré/i);
  });
});
