import { MemoryRouter, Route, Routes } from "react-router-dom"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import { DeliveriesPage } from "@/features/deliveries/DeliveriesPage"
import type { DeliverySummary } from "@/shared/types"

const mocks = vi.hoisted(() => ({
  items: [] as DeliverySummary[],
}))

vi.mock("@/shared/api", async () => {
  const actual = await vi.importActual<typeof import("@/shared/api")>("@/shared/api")
  return {
    ...actual,
    useDeliveries: () => ({
      data: { message: { items: mocks.items, page: 1, pageLength: 20, hasNext: false } },
      isLoading: false,
      error: null,
    }),
  }
})

function renderDeliveries(path = "/deliveries") {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/deliveries" element={<DeliveriesPage />} />
          <Route path="/deliveries/:deliveryId" element={<div>Détail bon</div>} />
        </Routes>
      </MemoryRouter>
    </TooltipProvider>,
  )
}

const note: DeliverySummary = {
  name: "MAT-DN-2026-00003",
  postingDate: "2026-08-22",
  deliveryDate: "2026-08-22",
  status: "Livré",
  docstatus: 1,
  totalQuantity: 6,
  totalTtc: 5616,
  currency: "DZD",
  salesOrders: ["SAL-ORD-2026-00003"],
}

describe("page Bons de livraison", () => {
  beforeEach(() => {
    mocks.items = []
  })

  it("affiche la barre de filtres compacte", () => {
    renderDeliveries()
    expect(screen.getByRole("heading", { name: "Bons de livraison" })).toBeVisible()
    expect(screen.getByRole("textbox", { name: "Rechercher un bon de livraison" })).toBeVisible()
    expect(screen.getByRole("combobox", { name: "Statut" })).toHaveTextContent("Statut")
    expect(screen.getByRole("button", { name: "Période" })).toHaveTextContent("Période")
    expect(screen.getByRole("button", { name: "Trier par" })).toHaveTextContent("Date du bon")
    expect(screen.getByRole("button", { name: "Décroissant" })).toBeInTheDocument()
    expect(screen.getByText("Aucun bon de livraison")).toBeVisible()
  })

  it("propose de réinitialiser quand aucun résultat ne correspond", () => {
    renderDeliveries("/deliveries?status=Livré")
    expect(screen.getByText("Aucun bon ne correspond")).toBeVisible()
    expect(screen.getAllByRole("button", { name: "Réinitialiser" }).length).toBeGreaterThan(0)
  })

  it("trie au clic sur les en-têtes de colonnes", async () => {
    const user = userEvent.setup()
    mocks.items = [note]
    renderDeliveries()
    expect(screen.getByRole("button", { name: "Trier par Date" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Trier par Quantité" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Trier par Total TTC" })).toBeVisible()
    expect(screen.getByRole("columnheader", { name: /Date/ })).toHaveAttribute("aria-sort", "descending")
    await user.click(screen.getByRole("button", { name: "Trier par Date" }))
    expect(screen.getByRole("button", { name: "Croissant" })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Trier par Quantité" }))
    expect(screen.getByRole("button", { name: "Trier par" })).toHaveTextContent("Quantité")
  })
})
