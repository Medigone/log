import { describe, expect, it } from "vitest";
import {
  cashHandover,
  remainingHandover,
  returnedArticleCount,
  routeProgress,
  stopTimelineDetail,
  stopVisualState,
} from "@/features/driver/driverMobile";
import type { RouteStop } from "@/shared/types/distribution";

function stop(partial: Partial<RouteStop> & Pick<RouteStop, "deliveryNote" | "status">): RouteStop {
  return {
    customer: "C",
    customerName: "Client",
    customerGpsStatus: "known",
    requiresCustomerGeolocation: false,
    totalQuantity: 2,
    amountCollected: 0,
    amountToCollect: 1000,
    payments: [],
    invoiceStatus: "Non créée",
    planningStatus: "Planifié",
    sequence: 1,
    ...partial,
  };
}

describe("routeProgress", () => {
  it("compte livrés, restants et l’arrêt courant", () => {
    const progress = routeProgress([
      stop({ deliveryNote: "A", status: "Livré", amountCollected: 500 }),
      stop({ deliveryNote: "B", status: "Enlevé" }),
      stop({ deliveryNote: "C", status: "Préparé" }),
    ]);
    expect(progress).toMatchObject({ total: 3, done: 1, remaining: 2, delivered: 1, currentIndex: 1, collectedAmount: 500 });
  });
});

describe("stopVisualState", () => {
  it("marque l’arrêt courant parmi les non traités", () => {
    expect(stopVisualState(stop({ deliveryNote: "A", status: "Enlevé" }), true)).toBe("current");
    expect(stopVisualState(stop({ deliveryNote: "A", status: "Enlevé" }), false)).toBe("upcoming");
    expect(stopVisualState(stop({ deliveryNote: "A", status: "Non Livré" }), false)).toBe("failed");
  });
});

describe("cashHandover", () => {
  it("sépare espèces et chèques sans inventer un attendu serveur", () => {
    const result = cashHandover([
      stop({
        deliveryNote: "A",
        status: "Livré",
        amountCollected: 4000,
        amountToCollect: 0,
        grandTotal: 4000,
        payments: [{ name: "P1", method: "Espèces", amount: 4000, status: "Déclaré" }],
      }),
      stop({
        deliveryNote: "B",
        status: "Livré",
        amountCollected: 2000,
        amountToCollect: 0,
        grandTotal: 2000,
        payments: [{ name: "P2", method: "Chèque", amount: 2000, status: "Déclaré", chequeNumber: "123" }],
      }),
    ]);
    expect(result).toMatchObject({ cash: 4000, cheque: 2000, chequeCount: 1, total: 6000, expected: 6000, balanced: true });
    expect(remainingHandover(result, false).total).toBe(6000);
    expect(remainingHandover(result, true)).toMatchObject({ cash: 0, cheque: 0, chequeCount: 0, total: 0 });
  });
});

describe("returnedArticleCount", () => {
  it("compte les restes des BL non livrés et partiels", () => {
    expect(
      returnedArticleCount([
        stop({ deliveryNote: "A", status: "Livré", totalQuantity: 4 }),
        stop({
          deliveryNote: "B",
          status: "Non Livré",
          items: [{ name: "1", itemCode: "X", itemName: "X", quantity: 3, deliveredQuantity: 0, remainingQuantity: 3 }],
        }),
        stop({
          deliveryNote: "C",
          status: "Partiellement Livré",
          items: [{ name: "2", itemCode: "Y", itemName: "Y", quantity: 5, deliveredQuantity: 2, remainingQuantity: 3 }],
        }),
      ]),
    ).toBe(6);
  });
});

describe("stopTimelineDetail", () => {
  it("résume un livré avec heure et mode de paiement", () => {
    expect(
      stopTimelineDetail(
        stop({
          deliveryNote: "A",
          status: "Livré",
          completedAt: "2026-08-25 09:12:00",
          payments: [{ name: "P1", method: "Espèces", amount: 24800, status: "Déclaré" }],
          amountCollected: 24800,
        }),
        "delivered",
      ),
    ).toBe("09:12 · livré · espèces");
  });

  it("résume un échec avec le motif, sans inventer un montant", () => {
    expect(
      stopTimelineDetail(
        stop({
          deliveryNote: "B",
          status: "Non Livré",
          completedAt: "2026-08-25 10:05:00",
          failureReason: "Client absent",
        }),
        "failed",
      ),
    ).toBe("10:05 · Client absent");
  });

  it("résume un partiel avec les quantités livrées", () => {
    expect(
      stopTimelineDetail(
        stop({
          deliveryNote: "C",
          status: "Partiellement Livré",
          completedAt: "2026-08-25 10:41:00",
          items: [{ name: "1", itemCode: "X", itemName: "X", quantity: 14, deliveredQuantity: 8, remainingQuantity: 6 }],
        }),
        "partial",
      ),
    ).toBe("10:41 · partiel 8/14 art.");
  });
});
