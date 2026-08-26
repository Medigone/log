import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { TodayPage } from "@/features/today/TodayPage";

vi.mock("@/shared/api/distribution", () => ({
  apiErrorMessage: (error: unknown) => String(error),
  usePlanningBoard: () => ({
    data: {
      message: {
        unassigned: [{ deliveryNote: "DN-1" }],
        routes: [{
          name: "LIV-1",
          lifecycle: "En cours",
          driverName: "Karim",
          vehicleLabel: "Camion A",
          alerts: [],
          stops: [
            { deliveryNote: "DN-2", status: "Livré", sequence: 1, customerName: "Client A", latitude: 36.7, longitude: 3.0 },
            { deliveryNote: "DN-3", status: "Préparé", sequence: 2, customerName: "Client B", latitude: 36.8, longitude: 3.1 },
          ],
          routing: { geometry: { coordinates: [[3.0, 36.7], [3.1, 36.8]] } },
        }],
        exceptions: [],
      },
    },
    error: undefined,
    isLoading: false,
  }),
}));

vi.mock("@/shared/api/preparation", () => ({
  usePreparationQueue: () => ({
    data: {
      message: [
        { name: "SAL-ORD-1", customer_name: "Client Prépa", delivery_date: "2026-08-26", grand_total: 12000, total_qty: 4, per_picked: 0 },
      ],
    },
    error: undefined,
    isLoading: false,
  }),
}));

vi.mock("@/features/today/FleetMap", () => ({
  FleetMap: () => <div>Carte flotte</div>,
}));

describe("TodayPage", () => {
  it("affiche les commandes à préparer et le suivi de flotte", () => {
    render(
      <MemoryRouter>
        <TodayPage />
      </MemoryRouter>,
    );

    expect(screen.getByRole("heading", { name: /tableau de bord/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /commandes à préparer/i })).toBeInTheDocument();
    expect(screen.getByText("SAL-ORD-1")).toBeInTheDocument();
    expect(screen.getByText("Client Prépa")).toBeInTheDocument();
    expect(screen.getByText("Suivi des livraisons")).toBeInTheDocument();
    expect(screen.getByText("Carte flotte")).toBeInTheDocument();
    expect(screen.getByText("Camion A")).toBeInTheDocument();
    expect(screen.getByText("1 / 2 arrêts")).toBeInTheDocument();
  });
});
