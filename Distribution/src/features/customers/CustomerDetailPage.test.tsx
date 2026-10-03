import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { CustomerDetailPage } from "@/features/customers/CustomerDetailPage";
import { chooseOption } from "@/test/chooseOption";
import type { CustomerDetail } from "@/shared/api/customers";

const customer: CustomerDetail = {
  name: "CUST-1",
  customer_name: "PHARMACIE CENTRALE",
  customer_type: "Company",
  customer_group: "Pharmacie",
  territory: "Algeria",
  status: "Actif",
  legal_form: "SARL",
  disabled: false,
  is_frozen: false,
  image: null,
  phone: "0550112233",
  email: "",
  main_phone: "",
  fax: "",
  main_email: "",
  main_contact_name: "",
  primary_contact: "C-1",
  primary_address: null,
  existence_date: null,
  is_virtual: false,
  key_account: false,
  small_quantities: false,
  rc: "16/00-123",
  nif: "",
  nis: "",
  ai: "",
  files: { rc: null, nif: null, nis: null, ai: null },
  commune: "COM-1",
  commune_name: "Bir El Djir",
  wilaya: "Oran",
  region: null,
  gps: { raw: "", latitude: null, longitude: null, precision_m: null, captured_at: null, captured_by: null, source_bl: null },
  default_price_list: null,
  effective_price_list: "Vente standard",
  payment_terms: null,
  credit_limits: [],
  quality: { client: 0, frequency: 0, interaction: 0, payments: 0, satisfaction: 0 },
  portal_users: [],
  contacts: [
    {
      name: "C-1",
      first_name: "Karim",
      last_name: "Benali",
      full_name: "Karim Benali",
      designation: "Gérant",
      email: "karim@example.dz",
      phone: "0661223344",
      mobile: "0661223344",
      is_primary: true,
      user: null,
    },
  ],
  addresses: [],
  balance: [{ company: "Modern Pharma", currency: "DZD", amount: 15000 }],
  creation: null,
  modified: "2026-10-04 10:00:00",
};

const mocks = vi.hoisted(() => ({
  updateCustomer: vi.fn(),
  saveContact: vi.fn(),
  mutate: vi.fn(),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/shared/api/customers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api/customers")>();
  return {
    ...actual,
    useCustomer: () => ({ data: { message: customer }, error: undefined, isLoading: false, mutate: mocks.mutate }),
    useCustomerOptions: () => ({
      data: {
        message: {
          company: "Modern Pharma",
          currency: "DZD",
          companies: ["Modern Pharma"],
          statuses: ["Prospect", "Actif", "Dormant", "Perdu", "Exclu"],
          legal_forms: ["EI", "SARL", "Non Précisé"],
          customer_groups: ["Pharmacie", "Supérette"],
          price_lists: ["Vente standard", "Vente gros"],
          payment_terms_templates: ["30 jours"],
          wilayas: ["Oran"],
          address_types: ["Shipping", "Billing"],
        },
      },
    }),
    useCustomerMutations: () => ({ updateCustomer: mocks.updateCustomer, saveContact: mocks.saveContact }),
  };
});

function OrderEntryProbe() {
  const location = useLocation();
  const state = location.state as { customer?: { name: string; customer_name: string } } | null;
  return <p>Commande pour {state?.customer?.customer_name}</p>;
}

function renderPage(path = "/clients/CUST-1") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/clients/:customerId" element={<CustomerDetailPage />} />
        <Route path="/commandes/nouvelle" element={<OrderEntryProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CustomerDetailPage", () => {
  beforeEach(() => {
    mocks.updateCustomer.mockReset().mockResolvedValue(customer);
    mocks.saveContact.mockReset().mockResolvedValue(customer);
    mocks.mutate.mockReset().mockResolvedValue(undefined);
  });

  it("affiche l'en-tête avec statut, solde et absence de GPS", () => {
    renderPage();
    expect(screen.getByRole("heading", { name: "PHARMACIE CENTRALE" })).toBeInTheDocument();
    expect(screen.getByText("Sans GPS")).toBeInTheDocument();
    expect(screen.getByText(/Solde/)).toBeInTheDocument();
  });

  it("n'envoie que les champs modifiés de l'onglet Général", async () => {
    const user = userEvent.setup();
    renderPage();
    const save = screen.getByRole("button", { name: "Enregistrer" });
    expect(save).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "Grand compte" }));
    await chooseOption(user, screen.getByRole("combobox", { name: "Statut" }), "Dormant");
    await user.click(save);
    await waitFor(() => expect(mocks.updateCustomer).toHaveBeenCalledWith("CUST-1", { status: "Dormant", key_account: true }));
    expect(mocks.mutate).toHaveBeenCalledWith({ message: customer }, { revalidate: false });
  });

  it("enregistre la liste de prix et un plafond de crédit", async () => {
    const user = userEvent.setup();
    renderPage("/clients/CUST-1?tab=commercial");
    await chooseOption(user, screen.getByRole("combobox", { name: "Liste de prix" }), "Vente gros");
    await user.click(screen.getByRole("button", { name: /Ajouter/ }));
    const limit = screen.getByLabelText("Plafond (DA)");
    await user.clear(limit);
    await user.type(limit, "250000");
    await user.click(screen.getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(mocks.updateCustomer).toHaveBeenCalledWith("CUST-1", {
        default_price_list: "Vente gros",
        credit_limits: [{ company: "Modern Pharma", credit_limit: 250000, bypass_credit_limit_check: false }],
      }),
    );
  });

  it("ajoute un contact", async () => {
    const user = userEvent.setup();
    renderPage("/clients/CUST-1?tab=contacts");
    expect(screen.getByText("Karim Benali")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Ajouter/ }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Prénom"), "Sara");
    await user.type(within(dialog).getByLabelText("Mobile"), "0770000000");
    await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
    await waitFor(() =>
      expect(mocks.saveContact).toHaveBeenCalledWith(
        expect.objectContaining({ customer: "CUST-1", first_name: "Sara", mobile: "0770000000", is_primary: false }),
      ),
    );
  });

  it("ouvre une nouvelle commande avec le client pré-sélectionné", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: /Nouvelle commande/ }));
    expect(await screen.findByText("Commande pour PHARMACIE CENTRALE")).toBeInTheDocument();
  });
});
