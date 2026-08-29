import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReturnControlPanel, hasGoodsToReturn } from "@/features/preparation/ReturnControlPanel";

const mocks = vi.hoisted(() => ({
  routes: [] as Array<{ name: string; stock: { remainingQuantity: number; status: string; lines: unknown[] }; driverName?: string; vehicleLabel?: string }>,
}));

vi.mock("@/shared/api/distribution", () => ({
  apiErrorMessage: (error: unknown) => String(error),
  useReturnRoutes: () => ({ data: { message: mocks.routes }, error: undefined, isLoading: false, mutate: vi.fn() }),
  useDistributionMutations: () => ({ confirmRouteReturn: vi.fn(), fulfillment: false }),
}));

describe("hasGoodsToReturn", () => {
  it("ignore les tournées sans reliquat", () => {
    expect(hasGoodsToReturn({ stock: { remainingQuantity: 0, status: "Retour requis", loadedQuantity: 2, deliveredQuantity: 2, returnedQuantity: 0, lines: [] } })).toBe(false);
    expect(hasGoodsToReturn({ stock: { remainingQuantity: 3, status: "Retour requis", loadedQuantity: 3, deliveredQuantity: 0, returnedQuantity: 0, lines: [] } })).toBe(true);
  });
});

describe("ReturnControlPanel", () => {
  it("affiche un état vide s’il n’y a rien à ramener", () => {
    mocks.routes = [{
      name: "LIV-EMPTY",
      driverName: "Karim",
      vehicleLabel: "Camion A",
      stock: { remainingQuantity: 0, status: "Retour requis", lines: [] },
    }];
    render(<ReturnControlPanel />);
    expect(screen.getByText("Aucun retour à traiter")).toBeInTheDocument();
    expect(screen.queryByText("LIV-EMPTY")).not.toBeInTheDocument();
  });

  it("affiche les tournées qui ont un reliquat", () => {
    mocks.routes = [{
      name: "LIV-GOODS",
      driverName: "Karim",
      vehicleLabel: "Camion A",
      stock: { remainingQuantity: 4, status: "Retour déclaré", lines: [] },
    }];
    render(<ReturnControlPanel />);
    expect(screen.getByText("Retours à contrôler")).toBeInTheDocument();
    expect(screen.getByText(/indépendant du contrôle de caisse/i)).toBeInTheDocument();
    expect(screen.getByText("LIV-GOODS")).toBeInTheDocument();
    expect(screen.getByText("4 à retourner")).toBeInTheDocument();
  });
});
