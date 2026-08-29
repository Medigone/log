import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { PlanningPage } from "@/features/planning/PlanningPage";
import { reorderStops } from "@/features/planning/routeOrder";
import { chooseOption } from "@/test/chooseOption";
import type { DistributionRoute, PlanningBoard, RouteStop } from "@/shared/types/distribution";

const mocks = vi.hoisted(() => ({
  scheduleDeliveryNote: vi.fn().mockResolvedValue({}),
  reassignDeliveryNote: vi.fn().mockResolvedValue({}),
  mutate: vi.fn(),
  boardArgs: { dateFrom: "", dateTo: "", filters: {} as Record<string, unknown> },
}));

const publishedRoute = {
  name: "LIV-26-08-00002",
  date: "2026-08-26",
  lifecycle: "Publiée",
  plannedStart: "2026-08-26 12:00:00",
  plannedEnd: "2026-08-26 14:00:00",
  revision: 2,
  publishedRevision: 2,
  acknowledgedRevision: 0,
  acknowledged: false,
  needsReview: false,
  driver: "DRV-1",
  driverName: "Livreur Test",
  vehicle: "VEH-1",
  vehicleLabel: "Camion Test",
  totalQuantity: 12,
  totalCollected: 0,
  totalAmount: 0,
  alerts: [],
  routing: { status: "not_calculated", provider: "openrouteservice", profile: "driving-car", optimizationEnabled: false, stopDurationMinutes: 15, stopDurationSeconds: 900 },
  stock: { status: "À charger", loadedQuantity: 0, deliveredQuantity: 0, remainingQuantity: 0, returnedQuantity: 0, lines: [] },
  cash: { routeId: "LIV-26-08-00002", routeLifecycle: "Publiée", status: "Sans encaissement", declaredCash: 0, declaredCheques: 0, declaredTotal: 0, countedTotal: 0, validatedTotal: 0, payments: [] },
  stops: [],
} as DistributionRoute;

const board: PlanningBoard = {
  dateFrom: "2026-08-24",
  dateTo: "2026-08-30",
  unassigned: [{ deliveryNote: "DN-1", customer: "C-1", customerName: "Client Test", customerGpsStatus: "missing", requiresCustomerGeolocation: true, totalQuantity: 2, amountCollected: 0, amountToCollect: 1000, payments: [], invoiceStatus: "Non créée", status: "Préparé", planningStatus: "Non planifié", sequence: 1 }],
  assignments: [
    { deliveryNote: "DN-1", customer: "C-1", customerName: "Client Test", customerGpsStatus: "missing", requiresCustomerGeolocation: true, totalQuantity: 2, amountCollected: 0, amountToCollect: 1000, payments: [], invoiceStatus: "Non créée", status: "Préparé", planningStatus: "Non planifié", sequence: 1, routeRevision: 0 },
    {
      deliveryNote: "MAT-DN-2026-00003",
      customer: "C-2",
      customerName: "CLIENT 2",
      customerGpsStatus: "known",
      requiresCustomerGeolocation: false,
      totalQuantity: 12,
      amountCollected: 0,
      amountToCollect: 1000,
      payments: [],
      invoiceStatus: "Non créée",
      status: "Préparé",
      planningStatus: "En retard",
      sequence: 1,
      route: "LIV-26-08-00002",
      driver: "DRV-1",
      vehicle: "VEH-1",
      plannedDate: "2026-08-26",
      requestedDate: "2026-08-26",
      plannedStart: "2026-08-26T12:00:00",
      plannedEnd: "2026-08-26T14:00:00",
      routeRevision: 2,
    },
  ],
  routes: [publishedRoute],
  drivers: [
    { name: "DRV-1", label: "Livreur Test", active: true },
    { name: "DRV-2", label: "Livreur 2", active: true, vehicle: "VEH-2" },
  ],
  vehicles: [
    { name: "VEH-1", label: "Camion Test", active: true, capacity: 10 },
    { name: "VEH-2", label: "Camion B", active: true, capacity: 10 },
  ],
  exceptions: [],
};

vi.mock("@/shared/api/distribution", () => ({
  apiErrorMessage: (error: unknown) => String(error),
  usePlanningBoard: (dateFrom: string, dateTo: string, filters: Record<string, unknown> = {}) => {
    mocks.boardArgs = { dateFrom, dateTo, filters };
    return { data: { message: board }, error: undefined, isLoading: false, mutate: mocks.mutate };
  },
  useDistributionMutations: () => ({ scheduleDeliveryNote: mocks.scheduleDeliveryNote, reassignDeliveryNote: mocks.reassignDeliveryNote, publishRoute: vi.fn(), getRepreparationImpact: vi.fn(), reprepareChangedOrder: vi.fn(), saving: false }),
}));
vi.mock("@/features/planning/RouteMap", () => ({ RouteMap: () => <div>Carte OSM</div> }));

describe("PlanningPage", () => {
  it("ouvre la page sans date ni autre filtre", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PlanningPage />
      </MemoryRouter>,
    );
    expect(screen.getByLabelText(/^du$/i)).toHaveValue("");
    expect(screen.getByLabelText(/^au$/i)).toHaveValue("");
    expect(screen.getByLabelText("Recherche")).toHaveValue("");
    expect(screen.getByLabelText("Statut")).toBeInTheDocument();
    expect(screen.getByLabelText("Livreur")).toBeInTheDocument();
    expect(screen.getByLabelText("Véhicule")).toBeInTheDocument();
    await user.click(screen.getByLabelText("Statut"));
    expect(screen.getByRole("option", { name: "En retard" })).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: /alertes seules/i })).not.toBeChecked();
    expect(mocks.boardArgs).toEqual({ dateFrom: "", dateTo: "", filters: { allDates: true } });
  });
  it("réordonne les arrêts et recalcule les séquences", () => {
    const stops = [{ deliveryNote: "DN-1", sequence: 1 }, { deliveryNote: "DN-2", sequence: 2 }] as RouteStop[];
    expect(reorderStops(stops, 1, 0).map((stop) => [stop.deliveryNote, stop.sequence])).toEqual([["DN-2", 1], ["DN-1", 2]]);
  });

  it("ouvre le panneau et affecte un BL à une nouvelle tournée", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter><PlanningPage /></MemoryRouter>);
    const table = screen.getByRole("table", { name: /bons de livraison/i });
    expect(within(table).getByRole("columnheader", { name: /n° bl/i })).toBeInTheDocument();
    expect(within(table).getByRole("columnheader", { name: /statut/i })).toBeInTheDocument();
    expect(screen.getByText("GPS client à collecter")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /planifier/i }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/planifier la livraison/i)).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Position")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Tournée compatible")).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Motif")).not.toBeInTheDocument();
    await chooseOption(user, within(dialog).getByLabelText("Livreur"), "Livreur Test");
    await chooseOption(user, within(dialog).getByLabelText("Véhicule"), "Camion Test");
    await user.click(screen.getByRole("button", { name: /enregistrer la planification/i }));
    expect(mocks.scheduleDeliveryNote).toHaveBeenCalledWith(expect.objectContaining({ deliveryNote: "DN-1", driver: "DRV-1", vehicle: "VEH-1", position: 1 }));
    expect(mocks.reassignDeliveryNote).not.toHaveBeenCalled();
  });

  it("reprogramme un BL déjà planifié sans imposer une autre tournée", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <PlanningPage />
      </MemoryRouter>,
    );
    await user.click(screen.getByRole("button", { name: /reprogrammer/i }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/reprogrammer la livraison/i)).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Position")).not.toBeInTheDocument();
    const today = new Date();
    const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    expect(within(dialog).getByLabelText("Date planifiée")).toHaveValue(iso);
    await chooseOption(user, within(dialog).getByLabelText("Livreur"), "Livreur 2");
    await user.type(within(dialog).getByLabelText("Motif"), "Client reporté");
    await user.click(screen.getByRole("button", { name: /enregistrer la reprogrammation/i }));
    expect(mocks.reassignDeliveryNote).toHaveBeenCalledWith(
      expect.objectContaining({
        deliveryNote: "MAT-DN-2026-00003",
        plannedDate: iso,
        driver: "DRV-2",
        vehicle: "VEH-2",
        reason: "Client reporté",
      }),
    );
    expect(mocks.reassignDeliveryNote.mock.calls[0][0].targetRouteId).toBeUndefined();
  });
});
