import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ItemDetailPage } from "@/features/catalog/ItemDetailPage";
import { chooseOption } from "@/test/chooseOption";

const item = {
  item_code: "PARA-001",
  item_name: "Lait 1er âge 400 g",
  description: "Lait 1er âge 400 g",
  item_group: "Laits infantiles",
  brand: "BIOMIL",
  stock_uom: "N°",
  image: null,
  disabled: false,
  is_stock_item: true,
  has_batch_no: false,
  ppa: 1450,
  show_in_store: true,
  show_price_in_store: true,
  sales_quota: false,
  quota_max_qty: 0,
  barcodes: [{ barcode: "3017620422003", barcode_type: "EAN", uom: null }],
  uoms: [],
  taxes: [],
  has_stock_moves: true,
  stock: [{ warehouse: "Magasins - MP", actual_qty: 24, reserved_qty: 4, ordered_qty: 4, available_qty: 20, projected_qty: 20 }],
  selling_price_list: "Vente standard",
  buying_price_list: "Achat standard",
  selling_rate: 1200,
  buying_rate: 900,
  modified: "2026-10-03 10:00:00",
};

const mocks = vi.hoisted(() => ({
  updateItem: vi.fn(),
  saveItemPrice: vi.fn(),
  deleteItemPrice: vi.fn(),
  prices: {
    message: {
      item_code: "PARA-001",
      stock_uom: "N°",
      ppa: 1450,
      prices: [
        { name: "P-1", item_code: "PARA-001", price_list: "Vente standard", selling: true, buying: false, customer: null, customer_name: null, uom: "N°", rate: 1200, currency: "DZD", valid_from: null, valid_upto: null },
        { name: "P-2", item_code: "PARA-001", price_list: "Achat standard", selling: false, buying: true, customer: null, customer_name: null, uom: "N°", rate: 900, currency: "DZD", valid_from: null, valid_upto: null },
      ],
      pricing_rules: [],
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/shared/api/catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api/catalog")>();
  return {
    ...actual,
    useCatalogItem: () => ({ data: { message: item }, error: undefined, isLoading: false, mutate: vi.fn() }),
    useItemPrices: () => ({ data: mocks.prices, error: undefined, isLoading: false, mutate: vi.fn() }),
    useCatalogOptions: () => ({
      data: {
        message: {
          item_groups: [{ name: "Laits infantiles", parent: "Nutrition infantile", is_group: false, item_count: 1 }],
          brands: ["BIOMIL"],
          uoms: ["N°", "Carton"],
          default_uom: "N°",
          price_lists: [
            { name: "Vente standard", currency: "DZD", selling: true, buying: false, enabled: true },
            { name: "Achat standard", currency: "DZD", selling: false, buying: true, enabled: true },
            { name: "Grossistes", currency: "DZD", selling: true, buying: false, enabled: true },
          ],
          item_tax_templates: [{ name: "TVA 9% - MP", title: "TVA 9%" }],
          warehouses: [],
          customer_groups: [],
        },
      },
    }),
    useCatalogItems: () => ({ data: undefined, isLoading: false }),
    useCatalogMutations: () => ({
      updateItem: mocks.updateItem,
      saveItemPrice: mocks.saveItemPrice,
      deleteItemPrice: mocks.deleteItemPrice,
      searchCustomers: vi.fn().mockResolvedValue([]),
      uploading: false,
    }),
  };
});

function renderPage(tab = "") {
  return render(
    <MemoryRouter initialEntries={[`/articles/PARA-001${tab ? `?tab=${tab}` : ""}`]}>
      <Routes>
        <Route path="/articles/:itemCode" element={<ItemDetailPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ItemDetailPage", () => {
  beforeEach(() => {
    mocks.updateItem.mockReset().mockResolvedValue(item);
    mocks.saveItemPrice.mockReset().mockResolvedValue({});
  });

  it("modifie la désignation et fige l’unité d’un article déjà mouvementé", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByLabelText("Unité de stock")).toBeDisabled();
    const name = screen.getByLabelText("Désignation");
    await user.clear(name);
    await user.type(name, "Lait 1er âge 800 g");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(mocks.updateItem).toHaveBeenCalledWith(expect.objectContaining({ item_code: "PARA-001", item_name: "Lait 1er âge 800 g" })),
    );
  });

  it("active la vente en quota avec une quantité max", async () => {
    const user = userEvent.setup();
    renderPage();
    const save = screen.getByRole("button", { name: "Enregistrer le quota" });
    expect(screen.getByLabelText("Quantité max par commande")).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "Activer la vente en quota" }));
    expect(save).toBeDisabled();
    await user.type(screen.getByLabelText("Quantité max par commande"), "6");
    await user.click(save);
    await waitFor(() =>
      expect(mocks.updateItem).toHaveBeenCalledWith({ item_code: "PARA-001", sales_quota: true, quota_max_qty: 6 }),
    );
  });

  it("ajoute une unité carton et un code-barres carton", async () => {
    const user = userEvent.setup();
    renderPage("codes");
    await user.click(screen.getByRole("button", { name: /Ajouter une unité/ }));
    await chooseOption(user, screen.getByRole("combobox", { name: "Unité 1" }), "Carton");
    await user.type(screen.getByLabelText("Facteur de conversion 1"), "12");
    await user.click(screen.getByRole("button", { name: /^Ajouter$/ }));
    await user.type(screen.getByLabelText("Code-barres 2"), "CARTON-001");
    await chooseOption(user, screen.getByRole("combobox", { name: "Unité du code-barres 2" }), "Carton");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(mocks.updateItem).toHaveBeenCalledWith({
        item_code: "PARA-001",
        barcodes: [
          { barcode: "3017620422003", uom: null },
          { barcode: "CARTON-001", uom: "Carton" },
        ],
        uoms: [{ uom: "Carton", conversion_factor: 12 }],
      }),
    );
  });

  it("saisit un prix dans une liste qui n’en a pas encore", async () => {
    const user = userEvent.setup();
    renderPage("prix");
    const table = screen.getByRole("table", { name: "Prix par liste" });
    expect(within(table).getByLabelText("Prix Vente standard")).toHaveValue("1200");
    const input = within(table).getByLabelText("Prix Grossistes");
    await user.type(input, "1100{Enter}");
    await waitFor(() =>
      expect(mocks.saveItemPrice).toHaveBeenCalledWith(
        expect.objectContaining({ item_code: "PARA-001", price_list: "Grossistes", rate: 1100, name: undefined }),
      ),
    );
  });

  it("affiche le stock par entrepôt", () => {
    renderPage("stock");
    const table = screen.getByRole("table", { name: "Stock par entrepôt" });
    expect(within(table).getByText("Magasins - MP")).toBeInTheDocument();
    expect(within(table).getByText("20")).toBeInTheDocument();
  });
});
