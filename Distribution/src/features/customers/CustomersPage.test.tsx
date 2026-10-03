import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { CustomersPage } from "@/features/customers/CustomersPage";
import { chooseOption } from "@/test/chooseOption";

const row = (overrides: Record<string, unknown>) => ({
  customer_group: "Pharmacie",
  status: "Actif",
  disabled: false,
  is_frozen: false,
  commune: "COM-1",
  commune_name: "Bir El Djir",
  wilaya: "Oran",
  phone: "0550112233",
  nif: null,
  rc: null,
  default_price_list: null,
  payment_terms: null,
  has_gps: true,
  key_account: false,
  balance: 0,
  last_order: null,
  creation: null,
  ...overrides,
});

const mocks = vi.hoisted(() => ({
  list: { message: undefined as unknown },
  options: {
    message: {
      company: "Modern Pharma",
      currency: "DZD",
      companies: ["Modern Pharma"],
      statuses: ["Prospect", "Actif", "Dormant", "Perdu", "Exclu"],
      legal_forms: ["Non Précisé"],
      customer_groups: ["Pharmacie", "Supérette"],
      price_lists: ["Vente standard"],
      payment_terms_templates: ["30 jours"],
      wilayas: ["Alger", "Oran"],
      address_types: ["Shipping"],
    },
  },
  useCustomers: vi.fn(),
  bulkUpdate: vi.fn(),
  createCustomer: vi.fn(),
}));

vi.mock("@/shared/api/customers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api/customers")>();
  return {
    ...actual,
    useCustomers: (query: unknown) => {
      mocks.useCustomers(query);
      return { data: mocks.list, error: undefined, isLoading: false, isValidating: false, mutate: vi.fn() };
    },
    useCustomerOptions: () => ({ data: mocks.options }),
    useCustomerMutations: () => ({ bulkUpdate: mocks.bulkUpdate, createCustomer: mocks.createCustomer, exporting: false }),
  };
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/clients"]}>
      <Routes>
        <Route path="/clients" element={<CustomersPage />} />
        <Route path="/clients/:customerId" element={<p>Fiche client</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CustomersPage", () => {
  beforeEach(() => {
    mocks.useCustomers.mockClear();
    mocks.bulkUpdate.mockReset();
    mocks.list = {
      message: {
        customers: [
          row({ name: "CUST-1", customer_name: "PHARMACIE CENTRALE", key_account: true, balance: 15000 }),
          row({ name: "CUST-2", customer_name: "SUPERETTE EL AMEL", customer_group: "Supérette", status: "Prospect", has_gps: false }),
        ],
        total: 2,
        start: 0,
        limit: 25,
        counts: { tous: 2, Prospect: 1, Actif: 1, Dormant: 0, Perdu: 0, Exclu: 0, sans_gps: 1, desactives: 0 },
      },
    };
  });

  it("liste les clients avec statut, GPS et solde", () => {
    renderPage();
    const table = screen.getByRole("table", { name: "Clients" });
    expect(within(table).getByText("PHARMACIE CENTRALE")).toBeInTheDocument();
    expect(within(table).getByText("Grand compte")).toBeInTheDocument();
    expect(within(table).getByText("Prospect")).toBeInTheDocument();
    expect(within(table).getByText("sans GPS")).toBeInTheDocument();
  });

  it("filtre par tuile, catégorie et wilaya en revenant à la première page", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("Sans GPS"));
    await chooseOption(user, screen.getByRole("combobox", { name: "Catégorie" }), "Supérette");
    await chooseOption(user, screen.getByRole("combobox", { name: "Wilaya" }), "Oran");
    expect(mocks.useCustomers).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: "sans_gps", customerGroup: "Supérette", wilaya: "Oran", start: 0 }),
    );
  });

  it("transmet la recherche au serveur", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.type(screen.getByRole("textbox", { name: "Rechercher un client" }), "0550");
    await waitFor(() => expect(mocks.useCustomers).toHaveBeenLastCalledWith(expect.objectContaining({ search: "0550" })));
  });

  it("ouvre la fiche au clic sur une ligne", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByText("SUPERETTE EL AMEL"));
    expect(await screen.findByText("Fiche client")).toBeInTheDocument();
  });

  it("modifie la sélection en lot", async () => {
    const user = userEvent.setup();
    mocks.bulkUpdate.mockResolvedValue({ updated: ["CUST-1", "CUST-2"], errors: [] });
    renderPage();
    await user.click(screen.getByRole("checkbox", { name: "Sélectionner la page" }));
    expect(screen.getByText("2 clients sélectionnés")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Modifier la sélection/ }));
    const dialog = await screen.findByRole("dialog");
    await chooseOption(user, within(dialog).getByRole("combobox", { name: "Statut" }), "Dormant");
    await chooseOption(user, within(dialog).getByRole("combobox", { name: "Conditions de paiement" }), "Vider le champ");
    await user.click(within(dialog).getByRole("button", { name: "Appliquer" }));
    await waitFor(() =>
      expect(mocks.bulkUpdate).toHaveBeenCalledWith(["CUST-1", "CUST-2"], { status: "Dormant", payment_terms: "" }),
    );
    await waitFor(() => expect(screen.queryByText("2 clients sélectionnés")).not.toBeInTheDocument());
  });
});
