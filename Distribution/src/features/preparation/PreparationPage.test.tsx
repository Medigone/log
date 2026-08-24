import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { PreparationPage } from "@/features/preparation/PreparationPage";

const mocks = vi.hoisted(() => ({
  createPickList: vi.fn().mockResolvedValue({ name: "SESSION-PL-1", pick_lists: [{ name: "PL-1" }] }),
  queueData: { message: [{ name: "SO-1", customer_name: "Client Test", delivery_date: "2099-01-01", total_qty: 2 }] },
  pickListData: { message: { name: "SESSION-PL-1", sales_orders: ["SO-1"], pick_lists: [{ name: "PL-1", docstatus: 0, sales_orders: ["SO-1"], locations: [{ name: "PLI-1", pick_list: "PL-1", item_code: "ART-1", item_name: "Article test", warehouse: "DEPOT", qty: 2, stock_qty: 2, picked_qty: 2, sales_order: "SO-1" }], grouped: [] }], grouped: [{ item_code: "ART-1", item_name: "Article test", warehouse: "DEPOT", stock_qty: 2, rows: [{ name: "PLI-1", pick_list: "PL-1", item_code: "ART-1", item_name: "Article test", warehouse: "DEPOT", qty: 2, stock_qty: 2, picked_qty: 2, sales_order: "SO-1" }] }] } },
}));

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
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /créer la pick list/i }));
    await waitFor(() => expect(screen.getByRole("heading", { name: /session de préparation/i })).toBeInTheDocument());
    expect(screen.getByText(/pick list créée avec succès/i)).toBeInTheDocument();
    const quantity = screen.getByRole("spinbutton");
    await user.clear(quantity);
    await user.type(quantity, "1");
    await user.click(screen.getByRole("button", { name: /contrôle final/i }));
    expect(screen.getByText("-1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /confirmer et créer les BL/i })).toBeInTheDocument();
  });

  it("affiche une erreur exploitable si le serveur ne retourne aucune Pick List", async () => {
    mocks.createPickList.mockResolvedValueOnce({ name: "SESSION-VIDE" });
    const user = userEvent.setup();
    render(<MemoryRouter initialEntries={["/preparation"]}><PreparationPage /></MemoryRouter>);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: /créer la pick list/i }));
    expect(await screen.findByText(/n’a retourné aucune Pick List/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /^préparation$/i })).toBeInTheDocument();
  });
});
