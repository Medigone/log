import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { PreparationPage } from "@/features/preparation/PreparationPage";

const mocks = vi.hoisted(() => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
  return {
    createPickList: vi.fn().mockResolvedValue({ name: "SESSION-PL-1", pick_lists: [{ name: "PL-1" }] }),
    queueData: { message: [
      { name: "SO-1", customer_name: "Client Test 1", delivery_date: tomorrowIso, total_qty: 2, custom_wilaya: "Alger", custom_commune: "COM-0001", custom_commune_nom: "Alger Centre" },
      { name: "SO-2", customer_name: "Client Test 2", delivery_date: tomorrowIso, total_qty: 3, custom_wilaya: "Alger", custom_commune: "COM-0002", custom_commune_nom: "Bab Ezzouar" },
      { name: "SO-3", customer_name: "Client Test 3", delivery_date: "2099-01-01", total_qty: 1, custom_wilaya: "Oran", custom_commune: "COM-0003", custom_commune_nom: "Oran" },
    ] },
    pickListData: { message: { name: "SESSION-PL-1", sales_orders: ["SO-1"], pick_lists: [{ name: "PL-1", docstatus: 0, sales_orders: ["SO-1"], locations: [{ name: "PLI-1", pick_list: "PL-1", item_code: "ART-1", item_name: "Article test", warehouse: "DEPOT", qty: 2, stock_qty: 2, picked_qty: 2, sales_order: "SO-1" }], grouped: [] }], grouped: [{ item_code: "ART-1", item_name: "Article test", warehouse: "DEPOT", stock_qty: 2, rows: [{ name: "PLI-1", pick_list: "PL-1", item_code: "ART-1", item_name: "Article test", warehouse: "DEPOT", qty: 2, stock_qty: 2, picked_qty: 2, sales_order: "SO-1" }] }] } },
  };
});

vi.mock("@/shared/api/preparation", () => ({
  getPickGroupLocations: (group: { locations?: unknown[]; rows?: unknown[] }) => group.locations || group.rows || [],
  usePreparationQueue: () => ({ data: mocks.queueData, mutate: vi.fn(), error: undefined, isLoading: false }),
  useRecentPickLists: () => ({ data: { message: [] }, error: undefined, isLoading: false }),
  usePickSession: () => ({ data: mocks.pickListData, mutate: vi.fn(), error: undefined, isLoading: false }),
  usePreparationMutations: () => ({ createPickList: mocks.createPickList, updateQuantities: vi.fn(), submitPickList: vi.fn(), creating: false, saving: false, submitting: false }),
}));
vi.mock("@/shared/api/distribution", () => ({ apiErrorMessage: (error: unknown) => String(error) }));

describe("PreparationPage", () => {
  beforeEach(() => {
    mocks.createPickList.mockReset().mockResolvedValue({ name: "SESSION-PL-1", pick_lists: [{ name: "PL-1" }] });
  });

  it("passe de la file de commandes au contrôle des écarts", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: /créer la liste de prélèvement/i }));
    expect(screen.getByRole("dialog", { name: /confirmer la création/i })).toBeInTheDocument();
    expect(screen.getByText(/une par commande sélectionnée/i)).toBeInTheDocument();
    expect(mocks.createPickList).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: /confirmer la création/i }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /session de préparation/i })).toBeInTheDocument());
    expect(screen.getByText(/liste de prélèvement créée avec succès/i)).toBeInTheDocument();
    const quantity = screen.getByRole("spinbutton");
    await user.clear(quantity);
    await user.type(quantity, "1");
    await user.click(screen.getByRole("button", { name: /contrôle final/i }));
    expect(screen.getByText("-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirmer et créer les BL/i })).toBeInTheDocument();
  });

  it("permet d’annuler avant tout appel serveur", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: /créer la liste de prélèvement/i }));
    await user.click(screen.getByRole("button", { name: /annuler/i }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(mocks.createPickList).not.toHaveBeenCalled();
  });

  it("filtre les commandes de demain par wilaya puis sélectionne tout le résultat", async () => {
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);

    await user.click(screen.getByRole("button", { name: /demain/i }));
    await user.selectOptions(screen.getByLabelText("Wilaya"), "Alger");
    expect(screen.getByText("Commandes à prélever (2)")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Alger Centre" })).toHaveValue("COM-0001");
    expect(screen.queryByRole("option", { name: "COM-0001" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /tout sélectionner/i }));
    expect(screen.getByText("2 sélectionnées")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox").every((checkbox) => (checkbox as HTMLInputElement).checked)).toBe(true);

    await user.click(screen.getByRole("button", { name: /créer la liste de prélèvement/i }));
    expect(screen.getByText(/2 listes de prélèvement seront créées/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /confirmer la création/i }));
    expect(mocks.createPickList).toHaveBeenCalledWith(["SO-1", "SO-2"]);
  });

  it("affiche une erreur exploitable si le serveur ne retourne aucune liste de prélèvement", async () => {
    mocks.createPickList.mockResolvedValueOnce({ name: "SESSION-VIDE" });
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: /créer la liste de prélèvement/i }));
    await user.click(screen.getByRole("button", { name: /confirmer la création/i }));
    expect(await screen.findByText(/n’a retourné aucune liste de prélèvement/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^préparation$/i })).toBeInTheDocument();
  });
});
