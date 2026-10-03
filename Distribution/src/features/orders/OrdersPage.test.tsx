import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { OrdersPage } from "@/features/orders/OrdersPage";

const mocks = vi.hoisted(() => ({
  useOrders: vi.fn(),
  list: {
    message: {
      orders: [
        {
          name: "SAL-ORD-1",
          customer: "PHARMACIE ATLAS",
          customer_name: "PHARMACIE ATLAS",
          transaction_date: "2026-10-03",
          delivery_date: "2026-10-04",
          total_qty: 12,
          total: 4130,
          status: "Draft",
          docstatus: 0,
          per_delivered: 0,
          delivery_state: "non_livree",
          origin: "Interne",
          wilaya: "Oran",
          owner: "commercial@test",
          owner_name: "Karim Commercial",
          modified: "2026-10-03 10:00:00",
        },
        {
          name: "SAL-ORD-2",
          customer: "PARA SUD",
          customer_name: "PARA SUD",
          transaction_date: "2026-10-02",
          delivery_date: "2026-10-03",
          total_qty: 4,
          total: 900,
          status: "To Deliver and Bill",
          docstatus: 1,
          per_delivered: 40,
          delivery_state: "partielle",
          origin: "Portail client",
          wilaya: "Ouargla",
          owner: "client@test",
          owner_name: "Client",
          modified: "2026-10-02 10:00:00",
        },
      ],
      counts: { a_livrer: 2, brouillons: 1, brouillons_portail: 0, soumises_aujourdhui: 3, montant_aujourdhui: 25000 },
    },
  },
}));

vi.mock("@/shared/api/orders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api/orders")>();
  return {
    ...actual,
    useOrders: (status: string, origin: string, mine: boolean) => {
      mocks.useOrders(status, origin, mine);
      return { data: mocks.list, error: undefined, isLoading: false, mutate: vi.fn() };
    },
  };
});

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/commandes"]}>
      <Routes>
        <Route path="/commandes" element={<OrdersPage />} />
        <Route path="/commandes/nouvelle" element={<p>Saisie nouvelle commande</p>} />
        <Route path="/commandes/:orderId" element={<p>Fiche commande</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("OrdersPage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("liste les commandes avec statut et origine, et filtre", async () => {
    const user = userEvent.setup();
    renderPage();

    expect(screen.getByText("PHARMACIE ATLAS")).toBeInTheDocument();
    expect(screen.getAllByText("À valider").length).toBeGreaterThan(0);
    expect(screen.getByText("Partiellement livrée")).toBeInTheDocument();
    expect(screen.getByText("40 %")).toBeInTheDocument();
    expect(screen.getByText(/SAL-ORD-2 · Ouargla · Portail/)).toBeInTheDocument();
    expect(mocks.useOrders).toHaveBeenLastCalledWith("all", "all", false);

    await user.click(screen.getByRole("button", { name: /Mes commandes/ }));
    expect(mocks.useOrders).toHaveBeenLastCalledWith("all", "all", true);
    await user.click(screen.getByRole("button", { name: /À valider/ }));
    expect(mocks.useOrders).toHaveBeenLastCalledWith("brouillon", "all", true);

    await user.type(screen.getByLabelText("Rechercher une commande"), "ouargla");
    expect(screen.queryByText("PHARMACIE ATLAS")).not.toBeInTheDocument();
  });

  it("ouvre la saisie et les fiches", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getAllByRole("button", { name: /Nouvelle commande/ })[0]);
    expect(await screen.findByText("Saisie nouvelle commande")).toBeInTheDocument();
  });

  it("imprime les commandes sélectionnées en un seul PDF", async () => {
    const user = userEvent.setup();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);
    renderPage();

    await user.click(screen.getByRole("checkbox", { name: "Sélectionner SAL-ORD-1" }));
    expect(screen.queryByText("Fiche commande")).not.toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Sélectionner SAL-ORD-2" }));
    const bar = screen.getByRole("region", { name: "Commandes sélectionnées" });
    expect(within(bar).getByText("2 commandes sélectionnées")).toBeInTheDocument();

    await user.click(within(bar).getByRole("button", { name: /Imprimer \/ PDF/ }));
    expect(open).toHaveBeenCalledWith(
      `/api/method/log.order_print.download_orders_pdf?names=${encodeURIComponent(JSON.stringify(["SAL-ORD-1", "SAL-ORD-2"]))}`,
      "_blank",
      "noopener",
    );

    await user.click(screen.getByRole("checkbox", { name: "Sélectionner toutes les commandes affichées" }));
    expect(screen.queryByRole("region", { name: "Commandes sélectionnées" })).not.toBeInTheDocument();
    open.mockRestore();
  });
});
