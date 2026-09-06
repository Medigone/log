import { describe, expect, it } from "vitest";
import { lastRouteEvent, routeEvents } from "@/features/deliveries/routeEvents";
import type { DistributionRoute } from "@/shared/types/distribution";

function route(overrides: Partial<DistributionRoute> = {}): DistributionRoute {
  return {
    name: "LIV-1",
    date: "2026-09-06",
    lifecycle: "En cours",
    revision: 1,
    publishedRevision: 1,
    acknowledgedRevision: 1,
    acknowledged: true,
    needsReview: false,
    totalQuantity: 1,
    totalCollected: 0,
    totalAmount: 0,
    stops: [],
    routing: { status: "not_calculated" },
    stock: { status: "Chargé", lines: [], remainingQty: 0, loadedQty: 0, deliveredQty: 0, returnedQty: 0 },
    cash: { status: "Sans encaissement", payments: [], declaredCash: 0, declaredCheques: 0, declaredTotal: 0 },
    alerts: [],
    ...overrides,
  } as DistributionRoute;
}

describe("routeEvents", () => {
  it("expose l’heure de livraison à droite de l’événement", () => {
    const events = routeEvents(
      route({
        startedAt: "2026-09-06 08:00:00",
        stops: [
          {
            deliveryNote: "DN-1",
            customer: "C-1",
            customerName: "CLIENT 2",
            customerGpsStatus: "known",
            requiresCustomerGeolocation: false,
            totalQuantity: 1,
            amountCollected: 0,
            amountToCollect: 0,
            payments: [],
            invoiceStatus: "Créée",
            status: "Livré",
            planningStatus: "Terminé",
            completedAt: "2026-09-06 10:11:22",
            sequence: 1,
          },
        ],
      }),
    );

    const delivered = events.find((event) => event.label.startsWith("Livré"));
    expect(delivered?.time).toBe("10:11");
    expect(lastRouteEvent(route({ startedAt: "2026-09-06 08:00:00" }))?.time).toBe("08:00");
  });
});
