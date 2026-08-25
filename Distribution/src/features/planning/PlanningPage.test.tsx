import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { PlanningPage } from "@/features/planning/PlanningPage";
import { reorderStops } from "@/features/planning/routeOrder";
import type { PlanningBoard, RouteStop } from "@/shared/types/distribution";

const mocks = vi.hoisted(() => ({
  scheduleDeliveryNote: vi.fn().mockResolvedValue({}),
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
  useDistributionMutations: () => ({ scheduleDeliveryNote: mocks.scheduleDeliveryNote, reassignDeliveryNote: mocks.reassignDeliveryNote, publishRoute: vi.fn(), getRepreparationImpact: vi.fn(), reprepareChangedOrder: vi.fn(), saving: false }),
}));
vi.mock("@/features/planning/RouteMap", () => ({ RouteMap: () => <div>Carte OSM</div> }));

describe("PlanningPage", () => {
  it("réordonne les arrêts et recalcule les séquences", () => {
    const stops = [{ deliveryNote: "DN-1", sequence: 1 }, { deliveryNote: "DN-2", sequence: 2 }] as RouteStop[];
    expect(reorderStops(stops, 1, 0).map((stop) => [stop.deliveryNote, stop.sequence])).toEqual([["DN-2", 1], ["DN-1", 2]]);
  });

  it("ouvre le panneau et affecte un BL à une nouvelle tournée", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><PlanningPage /></MemoryRouter>);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /planifier/i }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/planifier la livraison/i)).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Position")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Tournée compatible")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Motif")).not.toBeInTheDocument();
    await user.selectOptions(within(dialog).getByLabelText("Livreur"), "DRV-1");
    await user.selectOptions(within(dialog).getByLabelText("Véhicule"), "VEH-1");
    await user.click(screen.getByRole("button", { name: /enregistrer la planification/i }));
    expect(mocks.scheduleDeliveryNote).toHaveBeenCalledWith(expect.objectContaining({ deliveryNote: "DN-1", driver: "DRV-1", vehicle: "VEH-1", position: 1 }));
    expect(mocks.reassignDeliveryNote).not.toHaveBeenCalled();
  });
});
