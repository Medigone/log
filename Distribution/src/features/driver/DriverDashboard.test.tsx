import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { DriverDashboard } from "@/features/driver/DriverDashboard";
import type { DriverDashboardData } from "@/shared/types/distribution";

const dashboard: DriverDashboardData = {
  date: "2026-08-25",
  driver: { name: "DRV-1", label: "Karim", vehicle: "Renault · 16-123-16" },
  kpis: {
    plannedStops: 12,
    completedStops: 7,
    deliveredStops: 6,
    failedStops: 1,
    remainingStops: 5,
    plannedRoutes: 1,
    amountCollected: 82000,
    amountToCollect: 68000,
  },
  cash: {
    balance: 45000,
    declaredCash: 50000,
    declaredCheques: 32000,
    declaredTotal: 82000,
    status: "À contrôler",
    updatedAt: "2026-08-25 10:00:00",
    movements: [{ name: "MVT-1", type: "Retour tournée", amount: 1500, balanceAfter: 45000 }],
  },
  routes: [{
    name: "LIV-1",
    lifecycle: "En cours",
    plannedStart: "2026-08-25 08:00:00",
    plannedEnd: "2026-08-25 16:00:00",
    vehicle: "VEH-1",
    vehicleLabel: "Renault · 16-123-16",
    stopsTotal: 12,
    stopsDone: 7,
    stopsRemaining: 5,
    collected: 82000,
    toCollect: 68000,
    cashStatus: "À contrôler",
  }],
  nextStop: {
    deliveryNote: "DN-8",
    routeId: "LIV-1",
    sequence: 8,
    customer: "CUST-8",
    customerName: "Épicerie Nord",
    address: "12 rue des Oliviers",
    amountToCollect: 12000,
    status: "Enlevé",
  },
  week: {
    from: "2026-08-19",
    to: "2026-08-25",
    deliveredStops: 42,
    plannedStops: 50,
    collected: 420000,
    days: [
      { date: "2026-08-19", plannedStops: 8, deliveredStops: 7, collected: 60000 },
      { date: "2026-08-20", plannedStops: 7, deliveredStops: 7, collected: 55000 },
      { date: "2026-08-21", plannedStops: 6, deliveredStops: 5, collected: 40000 },
      { date: "2026-08-22", plannedStops: 8, deliveredStops: 8, collected: 70000 },
      { date: "2026-08-23", plannedStops: 5, deliveredStops: 4, collected: 35000 },
      { date: "2026-08-24", plannedStops: 4, deliveredStops: 5, collected: 78000 },
      { date: "2026-08-25", plannedStops: 12, deliveredStops: 6, collected: 82000 },
    ],
  },
};

const emptyDashboard: DriverDashboardData = {
  ...dashboard,
  kpis: {
    plannedStops: 0,
    completedStops: 0,
    deliveredStops: 0,
    failedStops: 0,
    remainingStops: 0,
    plannedRoutes: 0,
    amountCollected: 0,
    amountToCollect: 0,
  },
  cash: { ...dashboard.cash, declaredCash: 0, declaredCheques: 0, declaredTotal: 0, status: "Sans encaissement", movements: [] },
  routes: [],
  nextStop: null,
};

describe("DriverDashboard", () => {
  it("affiche les KPI caisse, livraisons, arrêts et le planifié sans le prochain arrêt", () => {
    render(
      <DriverDashboard
        data={dashboard}
        loading={false}
        onRefresh={vi.fn()}
        completedStops={[{ deliveryNote: "DN-1", customerName: "Client A", status: "Livré" }]}
      />,
    );

    expect(screen.getByRole("heading", { name: /caisse et activité/i })).toBeInTheDocument();
    expect(screen.getByText("Caisse")).toBeInTheDocument();
    expect(screen.getByText(/45[\s\u00a0\u202f]?000/)).toBeInTheDocument();
    expect(screen.getByText("6 / 12")).toBeInTheDocument();
    expect(screen.getByText("7 / 12")).toBeInTheDocument();
    expect(screen.getByText(/5 restants/i)).toBeInTheDocument();
    expect(screen.getAllByText(/68[\s\u00a0\u202f]?000/).length).toBeGreaterThan(0);
    expect(screen.queryByText("Épicerie Nord")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /traiter cet arrêt/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ouvrir la tournée/i })).not.toBeInTheDocument();
    expect(screen.getByText("Client A")).toBeInTheDocument();
    expect(screen.getByText("À contrôler")).toBeInTheDocument();
    expect(screen.getByText(/42 livraisons/i)).toBeInTheDocument();
  });

  it("garde le solde visible sans tournée", () => {
    render(<DriverDashboard data={emptyDashboard} loading={false} onRefresh={vi.fn()} />);

    expect(screen.getByText(/aucune tournée publiée/i)).toBeInTheDocument();
    expect(screen.getByText(/45[\s\u00a0\u202f]?000/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /ouvrir la tournée/i })).not.toBeInTheDocument();
    expect(screen.getByText(/aucun arrêt traité/i)).toBeInTheDocument();
  });

  it("affiche l’erreur et un skeleton pendant le chargement", () => {
    const { rerender } = render(
      <DriverDashboard loading onRefresh={vi.fn()} error="Réseau indisponible" />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Réseau indisponible");
    expect(screen.getByLabelText(/chargement du bilan/i)).toBeInTheDocument();

    rerender(<DriverDashboard data={dashboard} loading={false} onRefresh={vi.fn()} />);
    expect(screen.queryByLabelText(/chargement du bilan/i)).not.toBeInTheDocument();
  });
});
