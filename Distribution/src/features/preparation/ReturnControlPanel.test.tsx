import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ReturnControlPanel, hasGoodsToReturn } from "@/features/preparation/ReturnControlPanel";

const mocks = vi.hoisted(() => ({
  routes: [] as Array<{
    name: string
    stock: { remainingQuantity: number; status: string; lines: unknown[] }
    driverName?: string
    vehicleLabel?: string
    revision?: number
  }>,
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
    expect(within(screen.getByRole("row", { name: /LIV-GOODS/ })).getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Camion A")).toBeInTheDocument();
  });

  it("déplie les articles à compter pour un retour", async () => {
    mocks.routes = [{
      name: "LIV-GOODS",
      driverName: "Karim",
      vehicleLabel: "Camion A",
      revision: 1,
      stock: {
        remainingQuantity: 4,
        status: "Retour déclaré",
        lines: [{
          name: "LINE-1",
          itemCode: "ART-1",
          itemName: "Article retour",
          deliveryNote: "DN-1",
          remainingQuantity: 4,
          uom: "Unité",
        }],
      },
    }];
    const user = userEvent.setup();
    render(<ReturnControlPanel />);
    await user.click(screen.getByRole("button", { name: "Afficher les articles" }));
    expect(screen.getByRole("region", { name: "Articles à retourner LIV-GOODS" })).toBeInTheDocument();
    expect(screen.getByText("Article retour")).toBeInTheDocument();
    expect(screen.getByText("ART-1")).toBeInTheDocument();
    expect(screen.getByText("DN-1")).toBeInTheDocument();
    expect(screen.getByLabelText("Quantité comptée ART-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirmer le retour complet/i })).toBeInTheDocument();
  });
});
