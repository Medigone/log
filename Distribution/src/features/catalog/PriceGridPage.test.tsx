import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { PriceGridPage } from "@/features/catalog/PriceGridPage";

const mocks = vi.hoisted(() => ({
  setGridPrice: vi.fn(),
  bulkUpdatePrices: vi.fn(),
  usePriceGrid: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/shared/api/catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api/catalog")>();
  return {
    ...actual,
    useCatalogOptions: () => ({
      data: { message: { item_groups: [], brands: [], selling_price_list: "Vente standard", price_lists: [] } },
    }),
    usePriceLists: () => ({
      data: {
        message: [
          { name: "Vente standard", currency: "DZD", selling: true, buying: false, enabled: true, item_count: 2 },
          { name: "Grossistes", currency: "DZD", selling: true, buying: false, enabled: true, item_count: 0 },
        ],
      },
      mutate: vi.fn(),
    }),
    usePriceGrid: (priceList: string) => {
      mocks.usePriceGrid(priceList);
      return {
        data: {
          message: {
            price_list: priceList,
            total: 1,
            start: 0,
            limit: 25,
            items: [
              { item_code: "PARA-001", item_name: "Lait 1er âge", item_group: "Laits", brand: null, stock_uom: "N°", ppa: 0, buying_rate: 1000, price_name: "P-1", rate: 1200 },
            ],
          },
        },
        error: undefined,
        isLoading: false,
        mutate: vi.fn(),
      };
    },
    useCatalogMutations: () => ({ setGridPrice: mocks.setGridPrice, bulkUpdatePrices: mocks.bulkUpdatePrices }),
  };
});

function renderPage() {
  return render(
    <MemoryRouter>
      <PriceGridPage />
    </MemoryRouter>,
  );
}

describe("PriceGridPage", () => {
  beforeEach(() => {
    mocks.setGridPrice.mockReset().mockResolvedValue({});
    mocks.bulkUpdatePrices.mockReset();
    mocks.usePriceGrid.mockClear();
  });

  it("modifie un prix dans la liste choisie et affiche la marge", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /^Grossistes/ }));
    expect(mocks.usePriceGrid).toHaveBeenLastCalledWith("Grossistes");
    const table = screen.getByRole("table");
    expect(within(table).getByText("20 %")).toBeInTheDocument();
    const input = within(table).getByLabelText("Prix de Lait 1er âge");
    await user.clear(input);
    await user.type(input, "1150{Enter}");
    // Rien n'est enregistré avant la confirmation.
    const dialog = await screen.findByRole("dialog");
    expect(mocks.setGridPrice).not.toHaveBeenCalled();
    expect(dialog).toHaveTextContent("-4.2 %");
    await user.click(within(dialog).getByRole("button", { name: "Confirmer le prix" }));
    await waitFor(() => expect(mocks.setGridPrice).toHaveBeenCalledWith("Grossistes", "PARA-001", 1150));
  });

  it("annule un changement de prix et signale un prix sous l’achat", async () => {
    const user = userEvent.setup();
    renderPage();
    const input = within(screen.getByRole("table")).getByLabelText("Prix de Lait 1er âge");
    await user.clear(input);
    await user.type(input, "900{Enter}");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByTestId("price-change-alerts")).toHaveTextContent("inférieur au prix d’achat");
    await user.click(within(dialog).getByRole("button", { name: "Annuler" }));
    expect(mocks.setGridPrice).not.toHaveBeenCalled();
    expect(input).toHaveValue("1200");
  });

  it("prévisualise puis applique une hausse en masse", async () => {
    const user = userEvent.setup();
    mocks.bulkUpdatePrices
      .mockResolvedValueOnce({ count: 1, applied: false, changes: [{ item_code: "PARA-001", item_name: "Lait 1er âge", old_rate: 1200, new_rate: 1260 }] })
      .mockResolvedValueOnce({ count: 1, applied: true, changes: [] });
    renderPage();
    await user.click(screen.getByRole("button", { name: /Mise à jour en masse/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Taux (%)"), "5");
    await user.click(within(dialog).getByRole("button", { name: "Prévisualiser" }));
    expect(await within(dialog).findByText("1 prix modifié")).toBeInTheDocument();
    expect(mocks.bulkUpdatePrices).toHaveBeenLastCalledWith(
      expect.objectContaining({ price_list: "Vente standard", operation: "percent", value: 5, round_to: 0, dry_run: true }),
    );
    await user.click(within(dialog).getByRole("button", { name: "Appliquer 1 prix" }));
    await waitFor(() => expect(mocks.bulkUpdatePrices).toHaveBeenLastCalledWith(expect.objectContaining({ dry_run: false })));
  });
});
