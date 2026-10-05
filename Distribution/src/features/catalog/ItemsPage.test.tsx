import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { ItemsPage } from "@/features/catalog/ItemsPage";
import { chooseOption } from "@/test/chooseOption";

const mocks = vi.hoisted(() => ({
  list: {
    message: {
      items: [
        {
          item_code: "PARA-001",
          item_name: "Lait 1er âge 400 g",
          item_group: "Laits infantiles",
          brand: "BIOMIL",
          stock_uom: "N°",
          image: null,
          disabled: false,
          show_in_store: true,
          ppa: 1450,
          selling_rate: 1200,
          buying_rate: 900,
          stock_qty: 24,
        },
        {
          item_code: "PARA-002",
          item_name: "Crème solaire SPF50",
          item_group: "Protection solaire",
          brand: null,
          stock_uom: "N°",
          image: null,
          disabled: false,
          show_in_store: false,
          ppa: 0,
          selling_rate: null,
          buying_rate: null,
          stock_qty: 0,
        },
      ],
      total: 2,
      start: 0,
      limit: 25,
      counts: { actifs: 2, desactives: 0, sans_prix: 1, hors_store: 1 },
      selling_price_list: "Vente standard",
      buying_price_list: "Achat standard",
    },
  },
  options: {
    message: {
      item_groups: [
        { name: "Tous les groupes d'articles", parent: null, is_group: true, item_count: 0 },
        { name: "Laits infantiles", parent: "Nutrition infantile", is_group: false, item_count: 1 },
      ],
      brands: ["BIOMIL"],
      uoms: ["N°", "Carton"],
      default_uom: "N°",
      price_lists: [],
      item_tax_templates: [],
      warehouses: [],
      customer_groups: [],
    },
  },
  useCatalogItems: vi.fn(),
  createItem: vi.fn(),
  saveBrand: vi.fn(),
}));

vi.mock("@/shared/api/catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api/catalog")>();
  return {
    ...actual,
    useCatalogItems: (query: unknown) => {
      mocks.useCatalogItems(query);
      return { data: mocks.list, error: undefined, isLoading: false, isValidating: false, mutate: vi.fn() };
    },
    useCatalogOptions: () => ({ data: mocks.options, mutate: vi.fn() }),
    useCatalogMutations: () => ({ createItem: mocks.createItem, saveBrand: mocks.saveBrand }),
  };
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/articles"]}>
      <Routes>
        <Route path="/articles" element={<ItemsPage />} />
        <Route path="/articles/:itemCode" element={<p>Fiche article</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ItemsPage", () => {
  beforeEach(() => {
    mocks.useCatalogItems.mockClear();
    mocks.createItem.mockReset();
    mocks.saveBrand.mockReset();
  });

  it("affiche les articles, leurs prix et signale ceux sans prix", () => {
    renderPage();
    const table = screen.getByRole("table", { name: "Articles" });
    expect(within(table).getByText("Lait 1er âge 400 g")).toBeInTheDocument();
    expect(within(table).getByText("Sans prix")).toBeInTheDocument();
    expect(within(table).getByText("Hors Store")).toBeInTheDocument();
  });

  it("filtre côté serveur via les indicateurs", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("Sans prix de vente"));
    await waitFor(() =>
      expect(mocks.useCatalogItems).toHaveBeenLastCalledWith(expect.objectContaining({ status: "sans_prix", start: 0 })),
    );
  });

  it("ouvre la fiche au clic sur une ligne", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("Lait 1er âge 400 g"));
    expect(await screen.findByText("Fiche article")).toBeInTheDocument();
  });

  it("crée un article puis ouvre sa fiche", async () => {
    const user = userEvent.setup();
    mocks.createItem.mockResolvedValue({ item_code: "PARA-003" });
    renderPage();
    await user.click(screen.getAllByRole("button", { name: /Nouvel article/ })[0]);
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Désignation"), "Gel douche");
    await user.type(within(dialog).getByLabelText("Code-barres"), "3017620422003");
    await chooseOption(user, within(dialog).getByRole("combobox", { name: "Groupe d’articles" }), /Laits infantiles/);
    await user.type(within(dialog).getByLabelText("Prix de vente"), "450,5");
    await user.click(within(dialog).getByRole("button", { name: "Créer l’article" }));

    await waitFor(() =>
      expect(mocks.createItem).toHaveBeenCalledWith(
        expect.objectContaining({
          item_name: "Gel douche",
          item_group: "Laits infantiles",
          stock_uom: "N°",
          barcodes: [{ barcode: "3017620422003" }],
          selling_rate: 450.5,
          show_in_store: true,
        }),
      ),
    );
    expect(mocks.createItem.mock.calls[0][0]).not.toHaveProperty("item_code");
    expect(await screen.findByText("Fiche article")).toBeInTheDocument();
  });

  it("crée une marque absente de la liste depuis le formulaire", async () => {
    const user = userEvent.setup();
    mocks.saveBrand.mockResolvedValue({ brands: [], name: "Mustela" });
    mocks.createItem.mockResolvedValue({ item_code: "STO-ITEM-2026-00001" });
    renderPage();
    await user.click(screen.getAllByRole("button", { name: /Nouvel article/ })[0]);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Code article")).toBeDisabled();
    await user.type(within(dialog).getByLabelText("Désignation"), "Gel lavant");
    await chooseOption(user, within(dialog).getByRole("combobox", { name: "Groupe d’articles" }), /Laits infantiles/);
    await user.click(within(dialog).getByRole("button", { name: "Nouvelle marque" }));
    await user.type(within(dialog).getByLabelText("Marque"), "Mustela{Enter}");

    await waitFor(() => expect(mocks.saveBrand).toHaveBeenCalledWith({ brand: "Mustela" }));
    expect(await within(dialog).findByRole("combobox", { name: "Marque" })).toHaveTextContent("Mustela");
    await user.click(within(dialog).getByRole("button", { name: "Créer l’article" }));
    await waitFor(() => expect(mocks.createItem).toHaveBeenCalledWith(expect.objectContaining({ brand: "Mustela" })));
  });
});
