import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { ItemAnalyticsData, ItemAnalyticsRow } from "@/shared/api/analytics";
import { ItemAnalyticsPage } from "@/features/analytics/ItemAnalyticsPage";
import { chooseOption } from "@/test/chooseOption";

function item(overrides: Partial<ItemAnalyticsRow>): ItemAnalyticsRow {
  return {
    item_code: "ART",
    item_name: "Article",
    item_group: "Laits infantiles",
    brand: null,
    stock_uom: "N°",
    disabled: false,
    qty: 0,
    revenue: 0,
    cost: 0,
    margin: 0,
    margin_rate: null,
    markup: null,
    cost_estimated: false,
    customers: 0,
    deliveries: 0,
    avg_price: null,
    list_price: null,
    buying_price: null,
    unit_cost: null,
    discount: null,
    discount_loss: 0,
    stock_qty: 0,
    stock_value: 0,
    cover_days: null,
    rotation: null,
    gmroi: null,
    last_sale: null,
    days_since_last_sale: null,
    expiring_qty: 0,
    expiring_value: 0,
    next_expiry: null,
    prev_revenue: 0,
    prev_margin: 0,
    revenue_delta: null,
    margin_delta: null,
    margin_share: null,
    abc: null,
    quadrant: null,
    alerts: [],
    impact: 0,
    ...overrides,
  };
}

const mocks = vi.hoisted(() => ({
  useItemAnalytics: vi.fn(),
  useCustomerAnalytics: vi.fn(),
  useItemAnalyticsDetail: vi.fn(),
}));

vi.mock("@/shared/api/analytics", () => mocks);

const star = item({
  item_code: "LAIT-1",
  item_name: "Lait 1er âge",
  qty: 120,
  revenue: 144000,
  cost: 108000,
  margin: 36000,
  margin_rate: 0.25,
  markup: 0.3333,
  margin_share: 0.9,
  abc: "A",
  quadrant: "star",
  stock_qty: 30,
  stock_value: 27000,
  cover_days: 22.5,
  rotation: 16.2,
  gmroi: 5.4,
  revenue_delta: 0.2,
});
const dormant = item({
  item_code: "CREME-9",
  item_name: "Crème solaire",
  stock_qty: 40,
  stock_value: 52000,
  alerts: [{ code: "dormant", tone: "danger", impact: 52000, value: 140 }],
  impact: 52000,
});
const loss = item({
  item_code: "SAVON-3",
  item_name: "Savon doux",
  qty: 50,
  revenue: 4000,
  cost: 5000,
  margin: -1000,
  margin_rate: -0.25,
  abc: "C",
  quadrant: "poids_mort",
  stock_qty: 10,
  stock_value: 1000,
  cover_days: 18,
  alerts: [{ code: "negative_margin", tone: "danger", impact: 1000, value: -0.25 }],
  impact: 1000,
});

const data: ItemAnalyticsData = {
  period: { from_date: "2026-07-08", to_date: "2026-10-05", days: 90 },
  previous_period: { from_date: "2026-04-09", to_date: "2026-07-07" },
  customer: null,
  thresholds: {
    dormant_days: 90,
    low_cover_days: 7,
    overstock_days: 120,
    expiry_days: 30,
    matrix: { margin_rate: 0.1, cover_days: 20 },
  },
  totals: {
    revenue: 148000,
    cost: 113000,
    margin: 35000,
    margin_rate: 0.2365,
    markup: 0.31,
    stock_value: 80000,
    rotation: 5.73,
    gmroi: 1.77,
    prev_revenue: 120000,
    prev_margin: 30000,
    revenue_delta: 0.2333,
    margin_delta: 0.1667,
    items_sold: 2,
    items_in_stock: 3,
    items_with_alerts: 2,
  },
  opportunities: {
    dormant: { amount: 52000, count: 1 },
    overstock: { amount: 0, count: 0 },
    expiry: { amount: 0, count: 0 },
    negative_margin: { amount: 1000, count: 1 },
    discount: { amount: 0, count: 0 },
    price_below_cost: { amount: 0, count: 0 },
    low_cover: { amount: 0, count: 0 },
  },
  quadrants: {
    star: { count: 1, revenue: 144000, margin: 36000, stock_value: 27000 },
    locomotive: { count: 0, revenue: 0, margin: 0, stock_value: 0 },
    pepite: { count: 0, revenue: 0, margin: 0, stock_value: 0 },
    poids_mort: { count: 1, revenue: 4000, margin: -1000, stock_value: 1000 },
  },
  items: [star, loss, dormant],
  filters: { item_groups: ["Laits infantiles"], brands: [], customers: [{ value: "CLI-1", label: "Pharmacie Centrale" }] },
};

function renderPage() {
  return render(
    <MemoryRouter>
      <ItemAnalyticsPage />
    </MemoryRouter>,
  );
}

describe("ItemAnalyticsPage", () => {
  beforeEach(() => {
    mocks.useItemAnalytics.mockReset().mockReturnValue({ data: { message: data }, error: undefined, isLoading: false, isValidating: false, mutate: vi.fn() });
    mocks.useCustomerAnalytics.mockReset().mockReturnValue({
      data: {
        message: {
          period: data.period,
          previous_period: data.previous_period,
          totals: { customers: 1, revenue: 148000, margin: 35000, margin_rate: 0.2365, losing_customers: 0 },
          customers: [
            {
              customer: "CLI-1",
              customer_name: "Pharmacie Centrale",
              revenue: 148000,
              cost: 113000,
              margin: 35000,
              margin_rate: 0.2365,
              margin_share: 1,
              abc: "A",
              items: 2,
              deliveries: 6,
              avg_basket: 24667,
              last_purchase: "2026-10-01",
              days_since_last_purchase: 4,
              prev_revenue: 0,
              prev_margin: 0,
              revenue_delta: null,
              margin_delta: null,
              top_items: [{ item_code: "LAIT-1", item_name: "Lait 1er âge", revenue: 144000, margin: 36000 }],
            },
          ],
        },
      },
      error: undefined,
      isLoading: false,
    });
    mocks.useItemAnalyticsDetail.mockReset().mockReturnValue({ data: undefined, error: undefined, isLoading: true });
  });

  it("affiche les indicateurs, les gisements de profit et les actions prioritaires", () => {
    renderPage();
    const kpis = screen.getByRole("region", { name: "Indicateurs de rentabilité" });
    expect(within(kpis).getByText("Marge brute")).toBeInTheDocument();
    expect(within(kpis).getByText("+23 %")).toBeInTheDocument();
    const opportunities = screen.getByRole("region", { name: "Gisements de profit" });
    expect(within(opportunities).getByText("Stock dormant")).toBeInTheDocument();
    expect(within(opportunities).queryByText("Surstock")).not.toBeInTheDocument();
    const actions = screen.getByText("Actions prioritaires").closest("[data-slot=card]") as HTMLElement;
    const ranked = within(actions).getAllByRole("listitem");
    expect(ranked[0]).toHaveTextContent("Crème solaire");
    expect(ranked[0]).toHaveTextContent("140 j sans vente");
    expect(ranked[1]).toHaveTextContent("Savon doux");
  });

  it("filtre les articles depuis un quadrant ou un gisement", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Poids morts/ }));
    const table = screen.getByRole("table", { name: "Analyse par article" });
    expect(within(table).getByText("Savon doux")).toBeInTheDocument();
    expect(within(table).queryByText("Lait 1er âge")).not.toBeInTheDocument();

    await user.click(screen.getByRole("tab", { name: "Décisions" }));
    await user.click(within(screen.getByRole("region", { name: "Gisements de profit" })).getByRole("button", { name: /Stock dormant/ }));
    const filtered = screen.getByRole("table", { name: "Analyse par article" });
    expect(within(filtered).getByText("Crème solaire")).toBeInTheDocument();
    expect(within(filtered).queryByText("Savon doux")).not.toBeInTheDocument();
  });

  it("agrandit la matrice marge × rotation dans une fenêtre", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Agrandir/ }));
    const dialog = screen.getByRole("dialog", { name: "Matrice marge × rotation" });
    expect(within(dialog).getByRole("img", { name: /Nuage des articles/ })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ouvre la fiche d'un article en fenêtre depuis les actions prioritaires", async () => {
    const user = userEvent.setup();
    renderPage();
    const actions = screen.getByText("Actions prioritaires").closest("[data-slot=card]") as HTMLElement;
    await user.click(within(actions).getByRole("button", { name: /Savon doux/ }));
    const dialog = screen.getByRole("dialog", { name: "Savon doux" });
    expect(within(dialog).getByText("Corriger le prix de vente ou le prix d’achat")).toBeInTheDocument();
    expect(mocks.useItemAnalyticsDetail).toHaveBeenCalledWith("SAVON-3", expect.any(String), expect.any(String));
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Articles", selected: true })).toBeInTheDocument();
  });

  it("passe d'un client à l'analyse de ses articles", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("tab", { name: "Clients" }));
    const table = screen.getByRole("table", { name: "Analyse par client" });
    await user.click(within(table).getByText("Pharmacie Centrale"));
    await user.click(screen.getByRole("button", { name: /Analyser ses articles/ }));
    expect(mocks.useItemAnalytics).toHaveBeenLastCalledWith(expect.objectContaining({ customer: "CLI-1" }));
    expect(screen.getByText(/Analyse limitée aux ventes à/)).toHaveTextContent("Pharmacie Centrale");
  });

  it("recharge sur une nouvelle période et un groupe", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "30 j" }));
    const last = mocks.useItemAnalytics.mock.lastCall?.[0];
    expect(last.fromDate < last.toDate).toBe(true);
    await chooseOption(user, screen.getByRole("combobox", { name: "Groupe" }), "Laits infantiles");
    expect(mocks.useItemAnalytics).toHaveBeenLastCalledWith(expect.objectContaining({ itemGroup: "Laits infantiles" }));
  });
});
