import { describe, expect, it } from "vitest";
import type { DriverCashBox, DriverCashMovement } from "@/shared/types/distribution";
import {
  cashFlowTotals,
  cashState,
  cashStateCounts,
  displayedBalanceTotal,
  driverCashListKpis,
  driverInitials,
  filterCashBoxes,
  firstPositiveBox,
  signedAdjustment,
  signedBalance,
  sortCashBoxes,
} from "@/features/cashier/driverCashTotals";

const karim: DriverCashBox = { name: "CAISSE-DRV-1", driver: "DRV-1", driverName: "Karim", balance: 1500, active: true, updatedAt: "2026-08-25 10:00:00" };
const nadir: DriverCashBox = { name: "CAISSE-DRV-2", driver: "DRV-2", driverName: "Nadir", balance: -80, active: true, updatedAt: "2026-08-25 11:00:00" };
const samir: DriverCashBox = { name: "CAISSE-DRV-3", driver: "DRV-3", driverName: "Samir", balance: 0, active: false, updatedAt: "2026-08-24 09:00:00" };
const lila: DriverCashBox = { name: "CAISSE-DRV-4", driver: "DRV-4", driverName: "Lila", balance: 0, active: true, updatedAt: "2026-08-20 09:00:00" };

describe("cashState", () => {
  it("classe inactif avant le signe du solde", () => {
    expect(cashState({ ...karim, active: false })).toBe("Inactif");
    expect(cashState(nadir)).toBe("Négatif");
    expect(cashState(karim)).toBe("À remettre");
    expect(cashState(lila)).toBe("À zéro");
  });
});

describe("driverCashListKpis", () => {
  it("agrège les montants et ignore les inactifs dans l'encaisse", () => {
    const kpis = driverCashListKpis([karim, nadir, samir, lila]);
    expect(kpis.circulation).toBe(1420);
    expect(kpis.openCount).toBe(3);
    expect(kpis.toHandoverAmount).toBe(1500);
    expect(kpis.toHandoverCount).toBe(1);
    expect(kpis.negativeAmount).toBe(-80);
    expect(kpis.negativeCount).toBe(1);
    expect(kpis.inactiveCount).toBe(1);
  });
});

describe("filterCashBoxes / sortCashBoxes", () => {
  const boxes = [karim, nadir, samir, lila];

  it("masque les inactifs sans chip, et filtre par état", () => {
    expect(filterCashBoxes(boxes, new Set(), "").map((box) => box.driver)).toEqual(["DRV-1", "DRV-2", "DRV-4"]);
    expect(filterCashBoxes(boxes, new Set(["Inactif"]), "").map((box) => box.driver)).toEqual(["DRV-3"]);
    expect(filterCashBoxes(boxes, new Set(["Négatif", "À remettre"]), "").map((box) => box.driver)).toEqual(["DRV-1", "DRV-2"]);
  });

  it("trie par solde décroissant, nom, puis mouvement", () => {
    expect(sortCashBoxes(boxes, "balance").map((box) => box.driver)).toEqual(["DRV-1", "DRV-4", "DRV-3", "DRV-2"]);
    expect(sortCashBoxes(boxes, "name").map((box) => box.driverName)).toEqual(["Karim", "Lila", "Nadir", "Samir"]);
    const stamped = [
      { ...karim, lastMovement: { name: "A", type: "Encaissement", amount: 1, balanceAfter: 1, date: "2026-08-20" } },
      { ...nadir, lastMovement: { name: "B", type: "Remise", amount: -1, balanceAfter: 0, date: "2026-08-25" } },
    ];
    expect(sortCashBoxes(stamped, "updated").map((box) => box.driver)).toEqual(["DRV-2", "DRV-1"]);
  });

  it("ouvre la première caisse positive et totalise l'affichage", () => {
    expect(firstPositiveBox(sortCashBoxes(filterCashBoxes(boxes, new Set(), ""), "balance"))?.driver).toBe("DRV-1");
    expect(displayedBalanceTotal([karim, nadir])).toBe(1420);
  });
});

describe("signedAdjustment / signedBalance / initials", () => {
  it("signe une remise négative et une avance positive", () => {
    expect(signedAdjustment("Remise", 200)).toBe(-200);
    expect(signedAdjustment("Avance", 200)).toBe(200);
    expect(signedAdjustment("Ajustement", -75)).toBe(-75);
  });

  it("préfixe le solde et compose les initiales", () => {
    expect(signedBalance(1500)).toMatch(/^\+/);
    expect(signedBalance(-80)).toMatch(/^−/);
    expect(driverInitials("LIVREUR 1")).toBe("L1");
    expect(driverInitials("Karim")).toBe("KA");
  });
});

describe("cashFlowTotals", () => {
  const now = new Date("2026-09-06T12:00:00");
  const movements: DriverCashMovement[] = [
    { name: "E1", type: "Encaissement", amount: 2808, balanceAfter: 2808, date: "2026-09-05 10:00:00" },
    { name: "R1", type: "Remise", amount: -1500, balanceAfter: 1308, date: "2026-09-04 10:00:00" },
    { name: "A1", type: "Ajustement", amount: -80, balanceAfter: 1228, date: "2026-09-03 10:00:00" },
    { name: "OLD", type: "Encaissement", amount: 9000, balanceAfter: 9000, date: "2026-07-01 10:00:00" },
  ];

  it("agrège 30 jours et ignore l'historique plus ancien", () => {
    const flow = cashFlowTotals(movements, now);
    expect(flow.windowDays).toBe(30);
    expect(flow.collected).toBe(2808);
    expect(flow.collectedCount).toBe(1);
    expect(flow.handedOver).toBe(1500);
    expect(flow.handedOverCount).toBe(1);
    expect(flow.adjustments).toBe(-80);
  });

  it("compte les états de la liste", () => {
    expect(cashStateCounts([karim, nadir, samir, lila])).toEqual({
      "À remettre": 1,
      "À zéro": 1,
      Négatif: 1,
      Inactif: 1,
    });
  });
});
