import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import { OrderDetailPage } from "@/features/orders/OrderDetailPage"
import type { OrderSummary } from "@/shared/types"

const mocks = vi.hoisted(() => ({
  order: null as OrderSummary | null,
}))

vi.mock("@/shared/api", async () => {
  const actual = await vi.importActual<typeof import("@/shared/api")>("@/shared/api")
  return {
    ...actual,
    useOrder: () => ({ data: mocks.order ? { message: mocks.order } : null, isLoading: false, error: null, mutate: vi.fn() }),
    useOrderActions: () => ({ update: vi.fn(), remove: vi.fn(), saving: false }),
  }
})

const partialOrder: OrderSummary = {
  name: "SAL-ORD-2026-00003",
  transactionDate: "2026-08-20",
  deliveryDate: "2026-08-22",
  status: "Partiellement Livré",
  docstatus: 1,
  totalQuantity: 12,
  deliveredQuantity: 6,
  remainingQuantity: 6,
  deliveredTotalTtc: 5616,
  totalTtc: 11232,
  currency: "DZD",
  modified: "2026-08-22 10:00:00",
  source: "Interne",
  canEdit: false,
  items: [
    {
      itemCode: "Article 2",
      itemName: "Biomil 2 400 Gr",
      quantity: 12,
      deliveredQuantity: 6,
      remainingQuantity: 6,
      deliveredLineTotalTtc: 5616,
      uom: "N°",
      unitPriceTtc: 936,
      lineTotalTtc: 11232,
    },
  ],
  deliveries: [
    {
      name: "MAT-DN-2026-00003",
      postingDate: "2026-08-22",
      deliveryDate: "2026-08-22",
      status: "Partiellement Livré",
      docstatus: 1,
      totalQuantity: 6,
      totalTtc: 5616,
      currency: "DZD",
    },
  ],
}

const pendingOrder: OrderSummary = {
  name: "SAL-ORD-2026-00005",
  transactionDate: "2026-08-28",
  deliveryDate: "2026-08-29",
  status: "En attente de validation",
  docstatus: 0,
  totalQuantity: 24,
  totalTtc: 11040,
  currency: "DZD",
  modified: "2026-08-28 10:00:00",
  canEdit: true,
  items: [
    {
      itemCode: "Article 1",
      itemName: "Biomil 1 400 Gr",
      quantity: 12,
      uom: "N°",
      unitPriceTtc: 720,
      lineTotalTtc: 8640,
    },
    {
      itemCode: "Article 2",
      itemName: "Biomil 2 400 Gr",
      quantity: 12,
      uom: "N°",
      unitPriceTtc: 200,
      lineTotalTtc: 2400,
    },
  ],
}

function renderOrder(order = mocks.order, listSearch?: string) {
  return render(
    <TooltipProvider>
      <MemoryRouter
        initialEntries={[
          {
            pathname: `/orders/${order?.name}`,
            state: listSearch ? { listSearch } : undefined,
          },
        ]}
      >
        <Routes>
          <Route path="/orders/:orderId" element={<OrderDetailPage />} />
          <Route path="/deliveries/:deliveryId" element={<div>Bon de livraison</div>} />
          <Route path="/orders" element={<div>Liste commandes</div>} />
        </Routes>
      </MemoryRouter>
    </TooltipProvider>,
  )
}

describe("détail commande portail", () => {
  beforeEach(() => {
    mocks.order = partialOrder
  })

  it("affiche les quantités réellement livrées d'une commande partielle", async () => {
    const user = userEvent.setup()
    renderOrder()
    expect(screen.getByRole("heading", { name: "SAL-ORD-2026-00003" }).nextElementSibling).toHaveTextContent(
      "Partiellement Livré",
    )
    expect(screen.getByText("Interne")).toBeVisible()
    expect(screen.getByRole("tab", { name: "Articles" })).toBeVisible()
    expect(screen.getByRole("tab", { name: /Bons de livraison/ })).toHaveTextContent("1")
    expect(screen.getAllByText("Quantité livrée").length).toBeGreaterThan(0)
    expect(screen.getByText("Reste à livrer")).toBeVisible()
    expect(screen.getAllByText("6").length).toBeGreaterThan(0)
    expect(screen.getAllByText(/Livré 6/).length).toBeGreaterThan(0)
    expect(screen.getByText("6 / 12")).toBeVisible()
    expect(screen.getByRole("progressbar", { name: "Quantité livrée" })).toHaveAttribute("aria-valuenow", "6")
    expect(screen.getByRole("progressbar", { name: "Quantité livrée" }).firstElementChild).toHaveStyle({
      backgroundColor: "rgb(42, 157, 143)",
    })
    expect(screen.queryByRole("columnheader", { name: "Photo" })).not.toBeInTheDocument()
    expect(screen.queryByText(/N°/)).not.toBeInTheDocument()

    await user.click(screen.getByRole("tab", { name: /Bons de livraison/ }))
    expect(screen.getByRole("link", { name: "Consulter MAT-DN-2026-00003" })).toHaveAttribute(
      "href",
      "/deliveries/MAT-DN-2026-00003",
    )
    expect(screen.getByText("MAT-DN-2026-00003")).toBeVisible()
    expect(screen.getByText(/article\(s\) remis/)).toBeVisible()
    expect(screen.queryByRole("columnheader", { name: "Bon" })).not.toBeInTheDocument()
  })

  it("affiche la barre de quantité livrée en vert à 100 %", () => {
    mocks.order = {
      ...partialOrder,
      deliveredQuantity: 12,
      remainingQuantity: 0,
      items: [{ ...partialOrder.items![0], deliveredQuantity: 12, remainingQuantity: 0 }],
    }
    renderOrder()
    const bar = screen.getByRole("progressbar", { name: "Quantité livrée" })
    expect(bar).toHaveAttribute("aria-valuenow", "12")
    expect(bar.firstElementChild).toHaveStyle({ backgroundColor: "rgb(42, 157, 143)" })
    expect(screen.getByText("12 / 12")).toBeVisible()
  })

  it("masque le vocabulaire brouillon et n'affiche Enregistrer qu'après une modification", async () => {
    mocks.order = pendingOrder
    const user = userEvent.setup()
    renderOrder()

    expect(screen.getByText("En attente de validation")).toBeVisible()
    expect(screen.queryByText(/brouillon/i)).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Enregistrer les modifications" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Annuler la commande" })).toBeVisible()

    await user.click(screen.getByRole("button", { name: "Augmenter Biomil 1 400 Gr" }))
    expect(screen.getByRole("button", { name: "Enregistrer les modifications" })).toBeVisible()
  })

  it("restaure les filtres de liste depuis le bouton retour", () => {
    renderOrder(partialOrder, "?status=Livré")
    expect(screen.getByRole("button", { name: "Retour aux commandes" })).toHaveAttribute("href", "/orders?status=Livré")
  })
})
