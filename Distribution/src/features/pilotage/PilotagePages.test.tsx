import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { CustomerInsightsPage } from "@/features/pilotage/CustomerInsightsPage";
import { DeliveryPerformancePage } from "@/features/pilotage/DeliveryPerformancePage";
import { ObjectivesPage } from "@/features/pilotage/ObjectivesPage";
import { StockOperationsPage } from "@/features/pilotage/StockOperationsPage";
import { TreasuryPage } from "@/features/pilotage/TreasuryPage";

const mocks = vi.hoisted(() => ({
  useCashOverview: vi.fn(),
  useDeliveryPerformance: vi.fn(),
  useStockOperations: vi.fn(),
  useCustomerInsights: vi.fn(),
  useObjectives: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@/shared/api/pilotage", () => ({
  ...mocks,
  useSaveObjectives: () => ({ save: mocks.save, saving: false }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const period = { from_date: "2026-09-06", to_date: "2026-10-05" };
const ok = (message: unknown) => ({ data: { message }, error: undefined, isLoading: false, isValidating: false, mutate: vi.fn() });
const stats = { count: 3, average: 2.3, median: 2, p90: 4 };

function renderPage(page: React.ReactNode) {
  return render(<MemoryRouter>{page}</MemoryRouter>);
}

const objectives = {
  month: "2026-10-01",
  today: "2026-10-10",
  targets: { ca_ht: 1000000, marge: null, encaissements: null },
  notes: "",
  progress: {
    ca_ht: { actual: 310000, target: 1000000, progress: 0.31, projection: 961000, projected_progress: 0.961, expected_progress: 0.3226 },
    marge: { actual: 60000, target: null, progress: null, projection: 186000, projected_progress: null, expected_progress: 0.3226 },
    encaissements: { actual: 250000, target: null, progress: null, projection: 775000, projected_progress: null, expected_progress: 0.3226 },
  },
  history: [{ month: "2026-10-01", ca_ht: 310000, marge: 60000, encaissements: 250000, ca_ht_target: 1000000, marge_target: null, encaissements_target: null }],
};

describe("Pages de pilotage", () => {
  beforeEach(() => {
    mocks.useCashOverview.mockReturnValue(
      ok({
        period,
        totals: {
          collected: 120000, payments: 8, by_method: [{ method: "Espèce", amount: 100000 }, { method: "Chèque", amount: 20000 }],
          expected: 150000, tour_paid: 120000, collection_rate: 0.8, tours: 3, tours_with_gap: 1,
          to_control: 15000, gaps: 2500, gap_count: 1, cash_held: 30000,
        },
        series: [{ date: "2026-10-04", amount: 50000 }, { date: "2026-10-05", amount: 70000 }],
        drivers: [{ driver: "LIV-1", driver_name: "Karim", collected: 120000, gap: 2500, payments: 8 }],
        cash_boxes: [{ driver: "LIV-1", driver_name: "Karim", balance: 30000, updated: "2026-10-05" }],
        forecast: [
          { label: "Échu", from_date: null, to_date: "2026-10-04", invoices: 40000, orders: 0, total: 40000 },
          { label: "S+1", from_date: "2026-10-05", to_date: "2026-10-11", invoices: 10000, orders: 5000, total: 15000 },
        ],
      }),
    );
    mocks.useDeliveryPerformance.mockReturnValue(
      ok({
        period,
        totals: { closed: 20, delivered: 17, partial: 1, failed: 2, success_rate: 0.85, first_attempt_rate: 0.8, on_time_rate: 0.9, lead_time: stats },
        reasons: [{ reason: "Client absent", count: 2 }, { reason: "Refus client", count: 1 }],
        communes: [{ key: "Bir El Djir", closed: 10, delivered: 9, partial: 0, failed: 1, success_rate: 0.9, first_attempt_rate: 0.9 }],
        drivers: [{ key: "LIV-1", name: "Karim", closed: 20, delivered: 17, partial: 1, failed: 2, success_rate: 0.85, first_attempt_rate: 0.8, days: 4, stops_per_day: 5, cash_gap: 2500 }],
        vehicles: [{ vehicle: "VEH-1", vehicle_name: "Partner", stops: 20, fuel: 8000, km: 400, cost_per_km: 20, cost_per_stop: 400, maintenance: 1 }],
      }),
    );
    mocks.useStockOperations.mockReturnValue(
      ok({
        period,
        preparation: { pick_lists: 10, completed: 8, completion_rate: 0.8, hours: stats, late_orders: 2, late_amount: 22500, picking_errors: 1, error_rate: 0.125 },
        shortage: { lines: 6, orders: 3, value: 38500 },
        inventories: [{ name: "INV-1", title: "Inventaire rayon A", validated_at: "2026-10-01 10:00:00", lines: 50, gap_lines: 5, accuracy: 0.9, surplus: 1000, shortage: 4000, net: -3000 }],
        inventory_totals: { count: 1, surplus: 1000, shortage: 4000, net: -3000 },
        expiry: { buckets: { expired: 500, d30: 2000, d60: 0, d90: 1000 }, items: [{ item_code: "LAIT-1", item_name: "Lait 1er âge", qty: 4, value: 500, next_expiry: "2026-09-30", days: -5 }] },
      }),
    );
    mocks.useCustomerInsights.mockReturnValue(
      ok({
        period,
        at_risk: [{ customer: "CLI-1", customer_name: "Pharmacie Centrale", orders: 6, revenue: 300000, first_order: "2026-03-01", last_order: "2026-08-15", rhythm_days: 15, days_silent: 51, overdue_ratio: 3.4 }],
        at_risk_totals: { customers: 1, revenue: 300000 },
        origins: [
          { origin: "Interne", orders: 8, revenue: 80000, order_share: 0.8, revenue_share: 0.8 },
          { origin: "Portail client", orders: 2, revenue: 20000, order_share: 0.2, revenue_share: 0.2 },
        ],
        campaigns: [{ campaign: "C1", title: "Rentrée", views: 200, clicks: 20, add_to_cart: 5, click_rate: 0.1, cart_rate: 0.025 }],
        sales_reps: [{ user: "a@x", name: "Amine", orders: 8, customers: 5, revenue: 80000, avg_order: 10000, discount: 4000, discount_rate: 0.047, delivered: 70000, margin: 14000, margin_rate: 0.2, quota_overrides: 2 }],
      }),
    );
    mocks.useObjectives.mockReturnValue(ok(objectives));
    mocks.save.mockReset().mockResolvedValue(objectives);
  });

  it("Trésorerie : encaissé, caisses à remettre, écarts et prévision", () => {
    renderPage(<TreasuryPage />);
    const kpis = screen.getByRole("region", { name: "Indicateurs de trésorerie" });
    expect(within(kpis).getByText("Caisses livreurs à remettre")).toBeInTheDocument();
    expect(within(kpis).getByText(/80\s?%/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Encaissements attendus" })).toHaveTextContent("dont commandes");
    expect(within(screen.getByRole("table", { name: "Encaissements par livreur" })).getByText("Karim")).toBeInTheDocument();
  });

  it("Livraison : réussite, causes d’échec, livreurs et flotte", () => {
    renderPage(<DeliveryPerformancePage />);
    expect(screen.getByRole("region", { name: "Causes d’échec" })).toHaveTextContent("Client absent");
    expect(within(screen.getByRole("table", { name: "Coût de la flotte" })).getByText("Partner")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Indicateurs de livraison" })).toHaveTextContent("Au premier passage");
  });

  it("Préparation & stock : retards, ruptures, inventaires et péremption", () => {
    renderPage(<StockOperationsPage />);
    expect(screen.getByRole("region", { name: "Indicateurs de préparation et de stock" })).toHaveTextContent("Commandes en retard");
    expect(within(screen.getByRole("table", { name: "Lots proches de la péremption" })).getByText(/périmé depuis 5 j/)).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Écarts d’inventaire" })).getByRole("link", { name: "Inventaire rayon A" })).toHaveAttribute(
      "href",
      "/inventaires/INV-1",
    );
  });

  it("Clients & commercial : clients à risque, Store et commerciaux", () => {
    renderPage(<CustomerInsightsPage />);
    expect(within(screen.getByRole("table", { name: "Clients à risque" })).getByText("Pharmacie Centrale")).toBeInTheDocument();
    expect(within(screen.getByRole("table", { name: "Performance des commerciaux" })).getByText("Amine")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Indicateurs clients" })).toHaveTextContent("Part du Store");
  });

  it("Objectifs : projection et saisie des objectifs du mois", async () => {
    const user = userEvent.setup();
    renderPage(<ObjectivesPage />);
    const revenue = screen.getByRole("region", { name: "Chiffre d’affaires HT" });
    expect(revenue).toHaveTextContent("Fin de mois projetée");
    expect(screen.getByRole("region", { name: "Marge brute" })).toHaveTextContent("Aucun objectif fixé pour ce mois.");

    await user.click(screen.getAllByRole("button", { name: /Fixer les objectifs/ })[0]);
    await user.type(screen.getByRole("textbox", { name: "Marge brute" }), "250000");
    await user.click(screen.getByRole("button", { name: /Enregistrer les objectifs/ }));
    await waitFor(() =>
      expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ month: "2026-10-01", ca_ht: 1000000, marge: 250000, encaissements: null })),
    );
  });
});
