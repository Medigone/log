import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import userEvent from "@testing-library/user-event";
import { ReturnControlPanel, hasGoodsToReturn } from "@/features/preparation/ReturnControlPanel";
import type { ReturnHistoryRow } from "@/shared/types/distribution";

function renderReturns() {
  return render(
    <MemoryRouter>
      <ReturnControlPanel />
    </MemoryRouter>,
  );
}

function historyRow(overrides: Partial<ReturnHistoryRow> = {}): ReturnHistoryRow {
  return {
    name: "LIV-DONE",
    date: "2026-09-04",
    confirmedAt: "2026-09-04 18:20:00",
    revision: 1,
    driverName: "Karim",
    vehicleLabel: "Camion A",
    customers: [{ name: "C-1", customerName: "Client Un" }],
    status: "Retourné",
    remainingQuantity: 0,
    returnedQuantity: 4,
    loadedQuantity: 10,
    deliveredQuantity: 6,
    lines: [],
    ...overrides,
  };
}

const mocks = vi.hoisted(() => ({
  history: [] as ReturnHistoryRow[],
  routes: [] as Array<{
    name: string
    stock: { remainingQuantity: number; status: string; lines: unknown[] }
  }>,
  metrics: undefined as { declared: number; discrepancies: number; averageControlDelay: number | null; days: number } | undefined,
}));

vi.mock("@/shared/api/distribution", () => ({
  apiErrorMessage: (error: unknown) => String(error),
  useReturnRoutes: () => ({ data: { message: mocks.routes }, error: undefined, isLoading: false, mutate: vi.fn() }),
  useReturnHistory: () => ({ data: { message: mocks.history }, error: undefined, isLoading: false, mutate: vi.fn() }),
  useReturnMetrics: () => ({ data: { message: mocks.metrics }, error: undefined, isLoading: false }),
  useDistributionMutations: () => ({ confirmRouteReturn: vi.fn(), fulfillment: false }),
}));

describe("hasGoodsToReturn", () => {
  it("ignore les tournées sans reliquat", () => {
    expect(hasGoodsToReturn({ stock: { remainingQuantity: 0, status: "Retour requis", loadedQuantity: 2, deliveredQuantity: 2, returnedQuantity: 0, lines: [] } })).toBe(false);
    expect(hasGoodsToReturn({ stock: { remainingQuantity: 3, status: "Retour requis", loadedQuantity: 3, deliveredQuantity: 0, returnedQuantity: 0, lines: [] } })).toBe(true);
  });
});

describe("ReturnControlPanel", () => {
  it("garde le tableau visible pour un retour déjà confirmé", () => {
    mocks.history = [historyRow()];
    mocks.metrics = undefined;
    renderReturns();
    expect(screen.getByText("LIV-DONE")).toBeInTheDocument();
    expect(screen.getByText("Client Un")).toBeInTheDocument();
    expect(screen.getByText("Camion A")).toBeInTheDocument();
    expect(screen.getByText(/4 retournés/)).toBeInTheDocument();
    expect(screen.queryByText("Aucun retour en attente")).not.toBeInTheDocument();
    expect(screen.queryByText("Aucun retour")).not.toBeInTheDocument();
  });

  it("affiche un état vide interne s’il n’y a vraiment aucun retour", () => {
    mocks.history = [];
    mocks.metrics = undefined;
    renderReturns();
    expect(screen.getByText("Aucun retour")).toBeInTheDocument();
    expect(screen.getByText(/resteront listés ici/i)).toBeInTheDocument();
  });

  it("affiche les indicateurs 30 jours dès que l’API répond", () => {
    mocks.history = [];
    mocks.metrics = { declared: 14, discrepancies: 2, averageControlDelay: 42, days: 30 };
    renderReturns();
    expect(screen.getByLabelText("Retours · 30 jours")).toBeInTheDocument();
    expect(screen.getByText("Retours déclarés · 30 j")).toBeInTheDocument();
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("affiche les tournées qui ont un reliquat", () => {
    mocks.history = [historyRow({
      name: "LIV-GOODS",
      confirmedAt: null,
      status: "Retour déclaré",
      remainingQuantity: 4,
      returnedQuantity: 0,
      customers: [],
    })];
    renderReturns();
    expect(screen.getByText("Historique des retours")).toBeInTheDocument();
    expect(screen.getByText(/indépendant du contrôle de caisse/i)).toBeInTheDocument();
    expect(screen.getByText("LIV-GOODS")).toBeInTheDocument();
    expect(within(screen.getByRole("row", { name: /LIV-GOODS/ })).getByText(/4 à retourner/)).toBeInTheDocument();
    expect(screen.getByText("Camion A")).toBeInTheDocument();
  });

  it("déplie les articles à compter pour un retour", async () => {
    mocks.history = [historyRow({
      name: "LIV-GOODS",
      confirmedAt: null,
      status: "Retour déclaré",
      remainingQuantity: 4,
      returnedQuantity: 0,
      customers: [{ name: "C-1", customerName: "Client Un" }],
      lines: [{
        name: "LINE-1",
        itemCode: "ART-1",
        itemName: "Article retour",
        deliveryNote: "DN-1",
        deliveryNoteItem: "dni-1",
        sourceWarehouse: "WH-A",
        vehicleWarehouse: "WH-V",
        loadedQuantity: 4,
        deliveredQuantity: 0,
        remainingQuantity: 4,
        returnedQuantity: 0,
        uom: "Unité",
        customerName: "Client Un",
      }],
    })];
    const user = userEvent.setup();
    renderReturns();
    await user.click(screen.getByRole("button", { name: "Afficher les articles" }));
    expect(screen.getByRole("region", { name: "Articles à retourner LIV-GOODS" })).toBeInTheDocument();
    expect(screen.getByText("Article retour")).toBeInTheDocument();
    expect(screen.getByText("ART-1")).toBeInTheDocument();
    expect(screen.getByText("DN-1")).toBeInTheDocument();
    expect(screen.getByLabelText("Quantité comptée ART-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirmer le retour complet/i })).toBeInTheDocument();
  });

  it("filtre les tournées par chip de statut", async () => {
    mocks.history = [
      historyRow({
        name: "LIV-GOODS",
        confirmedAt: null,
        status: "Retour déclaré",
        remainingQuantity: 4,
        returnedQuantity: 0,
        driverName: "Karim",
        vehicleLabel: "Camion A",
        customers: [],
      }),
      historyRow({
        name: "LIV-WAIT",
        confirmedAt: null,
        status: "Retour requis",
        remainingQuantity: 2,
        returnedQuantity: 0,
        driverName: "Samir",
        vehicleLabel: "Camion B",
        customers: [],
      }),
      historyRow({
        name: "LIV-DONE",
        status: "Retourné",
        remainingQuantity: 0,
        returnedQuantity: 3,
        driverName: "Karim",
        vehicleLabel: "Camion A",
        customers: [{ name: "C-1", customerName: "Client Un" }],
      }),
    ];
    const user = userEvent.setup();
    renderReturns();
    expect(screen.getByText("LIV-GOODS")).toBeInTheDocument();
    expect(screen.getByText("LIV-WAIT")).toBeInTheDocument();
    expect(screen.getByText("LIV-DONE")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /à contrôler/i }));
    expect(screen.getByText("LIV-GOODS")).toBeInTheDocument();
    expect(screen.getByText("LIV-WAIT")).toBeInTheDocument();
    expect(screen.queryByText("LIV-DONE")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /confirmés/i }));
    expect(screen.queryByText("LIV-GOODS")).not.toBeInTheDocument();
    expect(screen.getByText("LIV-DONE")).toBeInTheDocument();
  });
});
