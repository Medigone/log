import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanningPage } from "@/features/planning/PlanningPage";
import { reorderStops } from "@/features/planning/routeOrder";
import type { PlanningBoard, RouteStop } from "@/shared/types/distribution";

const mocks = vi.hoisted(() => ({
  reassignDeliveryNote: vi.fn().mockResolvedValue({}),
  mutate: vi.fn(),
}));
const board: PlanningBoard = {
  dateFrom: "2026-08-24",
  dateTo: "2026-08-30",
  unassigned: [{ deliveryNote: "DN-1", customer: "C-1", customerName: "Client Test", totalQuantity: 2, amountToCollect: 1000, status: "Préparé", planningStatus: "Non planifié", sequence: 1 }],
  assignments: [{ deliveryNote: "DN-1", customer: "C-1", customerName: "Client Test", totalQuantity: 2, amountToCollect: 1000, status: "Préparé", planningStatus: "Non planifié", sequence: 1, routeRevision: 0 }],
  routes: [],
  drivers: [{ name: "DRV-1", label: "Livreur Test", active: true }],
  vehicles: [{ name: "VEH-1", label: "Camion Test", active: true, capacity: 10 }],
  exceptions: [],
};

vi.mock("@/shared/api/distribution", () => ({
  apiErrorMessage: (error: unknown) => String(error),
  usePlanningBoard: () => ({ data: { message: board }, error: undefined, isLoading: false, mutate: mocks.mutate }),
  useDistributionMutations: () => ({ reassignDeliveryNote: mocks.reassignDeliveryNote, publishRoute: vi.fn(), getRepreparationImpact: vi.fn(), reprepareChangedOrder: vi.fn(), saving: false }),
}));
vi.mock("@/features/planning/RouteMap", () => ({ RouteMap: () => <div>Carte OSM</div> }));

describe("PlanningPage", () => {
  it("réordonne les arrêts et recalcule les séquences", () => {
    const stops = [{ deliveryNote: "DN-1", sequence: 1 }, { deliveryNote: "DN-2", sequence: 2 }] as RouteStop[];
    expect(reorderStops(stops, 1, 0).map((stop) => [stop.deliveryNote, stop.sequence])).toEqual([["DN-2", 1], ["DN-1", 2]]);
  });

  it("ouvre le panneau et affecte un BL à une nouvelle tournée", async () => {
    const user = userEvent.setup();
    render(<PlanningPage />);
    await user.click(screen.getByRole("button", { name: /modifier/i }));
    const dialog = screen.getByRole("dialog");
    await user.selectOptions(within(dialog).getByLabelText("Livreur"), "DRV-1");
    await user.selectOptions(within(dialog).getByLabelText("Véhicule"), "VEH-1");
    await user.click(screen.getByRole("button", { name: /enregistrer l’affectation/i }));
    expect(mocks.reassignDeliveryNote).toHaveBeenCalledWith(expect.objectContaining({ deliveryNote: "DN-1", driver: "DRV-1", vehicle: "VEH-1" }));
  });
});
