import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { PricingRulesPage } from "@/features/catalog/PricingRulesPage";
import { chooseOption } from "@/test/chooseOption";

const mocks = vi.hoisted(() => ({
  savePricingRule: vi.fn(),
  setPricingRuleDisabled: vi.fn(),
  rules: {
    message: {
      rules: [
        {
          name: "PRLE-0001",
          title: "−10 % laits",
          apply_on: "Item Group",
          targets: ["Laits infantiles"],
          rate_or_discount: "Discount Percentage",
          discount_percentage: 10,
          discount_amount: 0,
          rate: 0,
          min_qty: 0,
          valid_from: "2026-10-01",
          valid_upto: null,
          applicable_for: "",
          party: null,
          for_price_list: null,
          priority: null,
          disabled: false,
          state: "active",
          editable: true,
        },
      ],
      counts: { active: 1 },
    },
  },
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/shared/api/catalog", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api/catalog")>();
  return {
    ...actual,
    usePricingRules: () => ({ data: mocks.rules, error: undefined, isLoading: false, mutate: vi.fn() }),
    useCatalogOptions: () => ({
      data: {
        message: {
          item_groups: [{ name: "Laits infantiles", parent: "Nutrition infantile", is_group: false, item_count: 3 }],
          brands: ["BIOMIL"],
          price_lists: [{ name: "Vente standard", currency: "DZD", selling: true, buying: false, enabled: true }],
          customer_groups: ["Pharmacie"],
        },
      },
    }),
    useCatalogItems: () => ({ data: undefined, isLoading: false }),
    useCatalogMutations: () => ({
      savePricingRule: mocks.savePricingRule,
      setPricingRuleDisabled: mocks.setPricingRuleDisabled,
      searchCustomers: vi.fn().mockResolvedValue([]),
    }),
  };
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/articles/promotions"]}>
      <Routes>
        <Route path="/articles/promotions" element={<PricingRulesPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("PricingRulesPage", () => {
  beforeEach(() => {
    mocks.savePricingRule.mockReset().mockResolvedValue({});
  });

  it("liste les promotions avec leur remise", () => {
    renderPage();
    const table = screen.getByRole("table", { name: "Promotions" });
    expect(within(table).getByText("−10 % laits")).toBeInTheDocument();
    expect(within(table).getByText("−10 %")).toBeInTheDocument();
  });

  it("crée une remise sur un groupe pour un groupe de clients", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getAllByRole("button", { name: /Nouvelle promotion/ })[0]);
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Titre"), "Rentrée");
    await chooseOption(user, within(dialog).getByRole("combobox", { name: "S’applique à" }), "Groupes d’articles");
    await chooseOption(user, within(dialog).getByRole("combobox", { name: "Ajouter un groupe" }), /Laits infantiles/);
    await user.type(within(dialog).getByLabelText("Remise (%)"), "15");
    await chooseOption(user, within(dialog).getByRole("combobox", { name: "Clients concernés" }), "Un groupe de clients");
    await chooseOption(user, within(dialog).getByRole("combobox", { name: "Groupe de clients" }), "Pharmacie");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

    await waitFor(() =>
      expect(mocks.savePricingRule).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Rentrée",
          apply_on: "Item Group",
          targets: ["Laits infantiles"],
          rate_or_discount: "Discount Percentage",
          value: 15,
          applicable_for: "Customer Group",
          party: "Pharmacie",
        }),
      ),
    );
  });
});
