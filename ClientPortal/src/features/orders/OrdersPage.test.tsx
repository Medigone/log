import { MemoryRouter, Route, Routes } from "react-router-dom"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import { OrdersPage } from "@/features/orders/OrdersPage"
import type { OrderSummary } from "@/shared/types"

const mocks = vi.hoisted(() => ({
  items: [] as OrderSummary[],
}))

vi.mock("@/shared/api", async () => {
  const actual = await vi.importActual<typeof import("@/shared/api")>("@/shared/api")
  return {
    ...actual,
    useOrders: () => ({
      data: { message: { items: mocks.items, page: 1, pageLength: 20, hasNext: false } },
      isLoading: false,
      error: null,
    }),
  }
})

function renderOrders(path = "/orders") {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/" element={<div>Store</div>} />
        </Routes>
      </MemoryRouter>
    </TooltipProvider>,
  )
}

describe("page Commandes", () => {
  beforeEach(() => {
    mocks.items = []
  })

  it("affiche la barre de filtres et le bouton nouvelle commande", () => {
    renderOrders()
    expect(screen.getByRole("heading", { name: "Commandes" })).toBeVisible()
    expect(screen.getByRole("textbox", { name: "Rechercher une commande" })).toBeVisible()
    expect(screen.getByRole("combobox", { name: "Statut" })).toHaveTextContent("Statut")
    expect(screen.getByRole("combobox", { name: "Origine" })).toHaveTextContent("Origine")
    expect(screen.getByRole("button", { name: "Période" })).toHaveTextContent("Période")
    expect(screen.getByRole("button", { name: "Trier par" })).toHaveTextContent("Date de commande")
    expect(screen.getByRole("button", { name: "Décroissant" })).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Nouvelle commande" }).length).toBeGreaterThan(0)
    expect(screen.getByText("Aucune commande")).toBeVisible()
  })

  it("affiche les libellés complets dans le filtre statut", async () => {
    const user = userEvent.setup()
    renderOrders()
    await user.click(screen.getByRole("combobox", { name: "Statut" }))
    expect(screen.getByRole("option", { name: "En attente de validation" })).toBeVisible()
    expect(screen.getByRole("option", { name: "Livraison en cours" })).toBeVisible()
  })

  it("affiche la valeur choisie dans le filtre origine", () => {
    renderOrders("/orders?source=Interne")
    expect(screen.getByRole("combobox", { name: "Origine" })).toHaveTextContent("Origine")
    expect(screen.getByRole("combobox", { name: "Origine" })).toHaveTextContent("Interne")
  })

  it("propose de réinitialiser quand aucun résultat ne correspond aux filtres", () => {
    renderOrders("/orders?status=Livré")
    expect(screen.getByText("Aucune commande ne correspond")).toBeVisible()
    expect(screen.getAllByRole("button", { name: "Réinitialiser" }).length).toBeGreaterThan(0)
  })

  it("affiche l'icône d'origine à côté du numéro et masque l'icône œil", () => {
    mocks.items = [
      {
        name: "SAL-ORD-2026-00003",
        transactionDate: "2026-08-20",
        deliveryDate: "2026-08-22",
        status: "À livrer",
        docstatus: 1,
        totalQuantity: 12,
        totalTtc: 11232,
        currency: "DZD",
        modified: "2026-08-22 10:00:00",
        source: "Portail client",
        canEdit: false,
      },
      {
        name: "SAL-ORD-2026-00004",
        transactionDate: "2026-08-21",
        deliveryDate: "2026-08-23",
        status: "À livrer",
        docstatus: 1,
        totalQuantity: 4,
        totalTtc: 2000,
        currency: "DZD",
        modified: "2026-08-21 10:00:00",
        source: null,
        canEdit: false,
      },
    ]
    renderOrders()
    expect(screen.queryByRole("columnheader", { name: "Origine" })).not.toBeInTheDocument()
    expect(screen.getAllByText("Origine de la commande : Portail client").length).toBeGreaterThan(0)
    expect(screen.queryByText(/Non renseignée/)).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /Consulter SAL-ORD/ })).not.toBeInTheDocument()
    expect(screen.getAllByRole("link", { name: "Consulter SAL-ORD-2026-00003" }).length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: "Trier par Date" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Trier par Livraison" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Trier par Total TTC" })).toBeVisible()
    expect(screen.getByRole("columnheader", { name: /Date/ })).toHaveAttribute("aria-sort", "descending")
  })

  it("inverse le tri au clic sur l'en-tête de colonne", async () => {
    const user = userEvent.setup()
    mocks.items = [
      {
        name: "SAL-ORD-2026-00003",
        transactionDate: "2026-08-20",
        deliveryDate: "2026-08-22",
        status: "À livrer",
        docstatus: 1,
        totalQuantity: 12,
        totalTtc: 11232,
        currency: "DZD",
        modified: "2026-08-22 10:00:00",
        source: "Portail client",
        canEdit: false,
      },
    ]
    renderOrders()
    await user.click(screen.getByRole("button", { name: "Trier par Date" }))
    expect(screen.getByRole("button", { name: "Trier par" })).toHaveTextContent("Date de commande")
    expect(screen.getByRole("button", { name: "Croissant" })).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: /Date/ })).toHaveAttribute("aria-sort", "ascending")
    await user.click(screen.getByRole("button", { name: "Trier par Livraison" }))
    expect(screen.getByRole("button", { name: "Trier par" })).toHaveTextContent("Date de livraison")
    expect(screen.getByRole("columnheader", { name: /Livraison/ })).toHaveAttribute("aria-sort", "descending")
  })

  it("bascule l'ordre depuis l'icône compacte", async () => {
    const user = userEvent.setup()
    renderOrders()
    await user.click(screen.getByRole("button", { name: "Décroissant" }))
    expect(screen.getByRole("button", { name: "Croissant" })).toBeInTheDocument()
  })
})
