import { describe, expect, it } from "vitest";
import type { CashCollection, DistributionRoute } from "@/shared/types/distribution";
import {
  allocateToOldest,
  cashBlocker,
  cashierListKpis,
  formatSignedMoney,
  hasMaterialGap,
  paymentEdits,
  paymentRowState,
  plural,
  routeDeclaredGap,
} from "@/features/cashier/cashTotals";

function payment(overrides: Partial<CashCollection> & Pick<CashCollection, "name">): CashCollection {
  return {
    deliveryNote: "DN-1",
    customer: "CUST-1",
    customerName: "Client",
    method: "Espèce",
    amount: 1500,
    countedAmount: 1500,
    status: "À contrôler",
    allocations: [{ salesInvoice: "SINV-1", outstandingBefore: 1500, allocatedAmount: 1500 }],
    unallocatedAmount: 0,
    ...overrides,
  };
}

function editsFor(payments: CashCollection[]) {
  return paymentEdits(payments);
}

function blocker(overrides: Partial<Parameters<typeof cashBlocker>[0]> = {}) {
  const payments = overrides.payments ?? [payment({ name: "PAY-1" })];
  return cashBlocker({
    status: "À contrôler",
    payments,
    edits: overrides.edits ?? editsFor(payments),
    countedCash: 1500,
    declaredTotal: 1500,
    reason: "",
    canResolveDiscrepancy: false,
    ...overrides,
  });
}

describe("cashTotals", () => {
  it("accorde les pluriels", () => {
    expect(plural(1, "tournée", "tournées")).toBe("1 tournée");
    expect(plural(2, "tournée", "tournées")).toBe("2 tournées");
  });

  it("signe l’écart", () => {
    expect(formatSignedMoney(-1000)).toMatch(/^−/);
    expect(formatSignedMoney(1250)).toMatch(/^\+/);
    expect(hasMaterialGap(0.4)).toBe(false);
    expect(hasMaterialGap(-1000)).toBe(true);
  });

  it("répartit le compté sur les factures les plus anciennes", () => {
    expect(
      allocateToOldest(1800, [
        { salesInvoice: "A", outstandingBefore: 1000, allocatedAmount: 0 },
        { salesInvoice: "B", outstandingBefore: 1000, allocatedAmount: 0 },
      ]),
    ).toEqual([
      { salesInvoice: "A", outstandingBefore: 1000, allocatedAmount: 1000 },
      { salesInvoice: "B", outstandingBefore: 1000, allocatedAmount: 800 },
    ]);
  });

  it("marque une ligne Avance si le compté dépasse l’affecté", () => {
    const row = payment({
      name: "PAY-1",
      amount: 5300,
      countedAmount: 5300,
      allocations: [{ salesInvoice: "SINV-1", outstandingBefore: 5300, allocatedAmount: 0 }],
      unallocatedAmount: 5300,
    });
    expect(paymentRowState(row, editsFor([row])[row.name], "À contrôler")).toBe("Avance");
  });
});

describe("cashBlocker", () => {
  it("bloque une caisse déjà validée", () => {
    expect(blocker({ status: "Validée" })).toMatchObject({
      key: "validated",
      buttonDisabled: true,
      buttonLabel: "Contrôle validé",
    });
  });

  it("bloque une tournée sans encaissement", () => {
    expect(blocker({ payments: [], countedCash: 0, declaredTotal: 0 })).toMatchObject({
      key: "empty",
      buttonDisabled: true,
      title: "Rien à contrôler",
    });
  });

  it("bloque un chèque sans numéro", () => {
    const payments = [payment({ name: "PAY-CH", method: "Chèque", chequeNumber: "" })];
    expect(blocker({ payments, countedCash: 0, declaredTotal: 1500 })).toMatchObject({
      key: "cheque-number",
      buttonDisabled: true,
    });
  });

  it("bloque une ventilation supérieure au compté", () => {
    const payments = [
      payment({
        name: "PAY-1",
        allocations: [{ salesInvoice: "SINV-1", outstandingBefore: 2000, allocatedAmount: 2000 }],
      }),
    ];
    expect(blocker({ payments })).toMatchObject({
      key: "over-allocated",
      buttonDisabled: true,
    });
  });

  it("exige un motif quand l’écart n’est pas justifié", () => {
    expect(blocker({ countedCash: 500, declaredTotal: 1500, reason: "" })).toMatchObject({
      key: "gap-reason",
      buttonDisabled: true,
    });
  });

  it("propose d’approuver l’écart au responsable", () => {
    expect(blocker({ countedCash: 500, declaredTotal: 1500, reason: "Billet manquant", canResolveDiscrepancy: true })).toMatchObject({
      key: "gap-ready",
      buttonDisabled: false,
      submitAsResolve: true,
      buttonLabel: "Approuver et comptabiliser l’écart",
    });
  });

  it("propose de transmettre l’écart au caissier", () => {
    expect(blocker({ countedCash: 500, declaredTotal: 1500, reason: "Billet manquant" })).toMatchObject({
      key: "gap-ready",
      submitAsResolve: false,
      buttonLabel: "Transmettre l’écart au responsable",
    });
  });

  it("laisse valider quand tout tombe juste", () => {
    expect(blocker()).toMatchObject({
      key: "ready",
      buttonDisabled: false,
      buttonLabel: "Valider le contrôle de caisse",
    });
  });
});

describe("cashierListKpis", () => {
  it("agrège déclaré, écarts et chèques sans inventer de comptage", () => {
    const routes = [
      {
        name: "A",
        date: "2026-08-30",
        cash: { status: "À contrôler", declaredTotal: 100, declaredCheques: 40, countedTotal: 0, payments: [{ method: "Chèque" }] },
      },
      {
        name: "B",
        date: "2026-09-01",
        cash: { status: "Écart", declaredTotal: 200, declaredCheques: 0, countedTotal: 150, payments: [] },
      },
      {
        name: "C",
        date: "2026-09-02",
        cash: { status: "Validée", declaredTotal: 80, declaredCheques: 80, countedTotal: 80, payments: [{ method: "Chèque" }] },
      },
    ] as unknown as DistributionRoute[];
    const kpis = cashierListKpis(routes);
    expect(kpis.toControlCount).toBe(1);
    expect(kpis.toControlAmount).toBe(100);
    expect(kpis.oldestToControl).toBe("2026-08-30");
    expect(kpis.gapCount).toBe(1);
    expect(kpis.gapAmount).toBe(-50);
    expect(kpis.chequesAmount).toBe(40);
    expect(kpis.chequePaymentCount).toBe(1);
    expect(kpis.validatedCount).toBe(1);
    expect(routeDeclaredGap(routes[1])).toBe(-50);
    expect(routeDeclaredGap(routes[0])).toBeNull();
  });
});
