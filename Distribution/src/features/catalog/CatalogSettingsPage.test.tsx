import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { CatalogSettingsPage } from "@/features/catalog/CatalogSettingsPage";

const mocks = vi.hoisted(() => ({
  saveStoreSettings: vi.fn(),
  saveBrand: vi.fn(),
  saveItemGroup: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/shared/api/catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api/catalog")>();
  return {
    ...actual,
    useCatalogOptions: () => ({
      data: {
        message: {
          item_groups: [
            { name: "Tous", parent: null, is_group: true, item_count: 0 },
            { name: "Nutrition infantile", parent: "Tous", is_group: true, item_count: 0 },
            { name: "Laits", parent: "Nutrition infantile", is_group: false, item_count: 2 },
            { name: "Céréales", parent: "Nutrition infantile", is_group: false, item_count: 1 },
          ],
        },
      },
      mutate: vi.fn(),
    }),
    useBrands: () => ({ data: { message: [{ name: "BIOMIL", item_count: 3 }] }, isLoading: false, mutate: vi.fn() }),
    useStoreSettings: () => ({
      data: {
        message: {
          store_groups: ["Laits", "Solaire"],
          effective_store_groups: ["Laits", "Solaire"],
          featured_groups: ["Laits"],
          rail_limit: 8,
          show_categories: true,
          show_promotions: true,
          show_featured: true,
          leaf_groups: ["Laits", "Solaire", "Visage"],
        },
      },
      error: undefined,
      mutate: vi.fn(),
    }),
    useCatalogMutations: () => ({ saveStoreSettings: mocks.saveStoreSettings, saveBrand: mocks.saveBrand, saveItemGroup: mocks.saveItemGroup }),
  };
});

function renderPage(tab: string) {
  return render(
    <MemoryRouter initialEntries={[`/articles/referentiels?tab=${tab}`]}>
      <CatalogSettingsPage />
    </MemoryRouter>,
  );
}

describe("CatalogSettingsPage", () => {
  beforeEach(() => {
    mocks.saveStoreSettings.mockReset().mockImplementation(async (payload) => ({ ...payload, leaf_groups: [], effective_store_groups: payload.store_groups }));
    mocks.saveBrand.mockReset().mockResolvedValue({ brands: [], name: "AVENE" });
  });

  it("ouvre et ferme les groupes de l’arbre", async () => {
    const user = userEvent.setup();
    renderPage("groupes");
    const tree = screen.getByRole("tree", { name: "Groupes d’articles" });
    expect(within(tree).getByText("Nutrition infantile")).toBeInTheDocument();
    expect(within(tree).queryByText("Laits")).not.toBeInTheDocument();
    await user.click(within(tree).getByRole("button", { name: "Déplier Nutrition infantile" }));
    expect(within(tree).getByText("Laits")).toBeInTheDocument();
    expect(within(tree).getByText("2 articles")).toBeInTheDocument();
    await user.click(within(tree).getByRole("button", { name: "Replier Nutrition infantile" }));
    expect(within(tree).queryByText("Laits")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Tout déplier/ }));
    expect(within(tree).getByText("Céréales")).toBeInTheDocument();
  });

  it("recherche un groupe sans tenir compte des accents", async () => {
    const user = userEvent.setup();
    renderPage("groupes");
    await user.type(screen.getByLabelText("Rechercher un groupe"), "cereales");
    const tree = screen.getByRole("tree", { name: "Groupes d’articles" });
    expect(within(tree).getByText("Céréales")).toBeInTheDocument();
    expect(within(tree).queryByText("Laits")).not.toBeInTheDocument();
    expect(within(tree).getByText("Nutrition infantile")).toBeInTheDocument();
  });

  it("ajoute un sous-groupe sous le groupe choisi", async () => {
    const user = userEvent.setup();
    mocks.saveItemGroup.mockResolvedValue({ item_groups: [], name: "Biscuits" });
    renderPage("groupes");
    await user.click(screen.getByRole("button", { name: "Ajouter un sous-groupe à Nutrition infantile" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Nom"), "Biscuits");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(mocks.saveItemGroup).toHaveBeenCalledWith({ name: undefined, item_group_name: "Biscuits", parent: "Nutrition infantile", is_group: false }),
    );
  });

  it("réordonne les rayons et choisit les vedettes", async () => {
    const user = userEvent.setup();
    renderPage("rayons");
    const list = screen.getByRole("list", { name: "Rayons du Store" });
    await user.click(within(list).getByRole("button", { name: "Monter Solaire" }));
    await user.click(within(list).getByRole("checkbox", { name: "Vedette : Solaire" }));
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(mocks.saveStoreSettings).toHaveBeenCalledWith(
        expect.objectContaining({ store_groups: ["Solaire", "Laits"], featured_groups: ["Solaire", "Laits"], rail_limit: 8 }),
      ),
    );
  });

  it("crée une marque", async () => {
    const user = userEvent.setup();
    renderPage("marques");
    expect(screen.getByText("BIOMIL")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Nouvelle marque/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Nom"), "AVENE");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() => expect(mocks.saveBrand).toHaveBeenCalledWith({ name: undefined, brand: "AVENE" }));
  });
});
