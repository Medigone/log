import { MemoryRouter, Route, Routes } from "react-router-dom"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import { RequestsPage } from "@/features/requests/RequestsPage"
import type { CatalogRequest } from "@/shared/types"

const mocks = vi.hoisted(() => ({
  items: [] as CatalogRequest[],
}))

vi.mock("@/shared/api", async () => {
  const actual = await vi.importActual<typeof import("@/shared/api")>("@/shared/api")
  return {
    ...actual,
    useCatalogRequests: () => ({
      data: { message: { items: mocks.items, page: 1, pageLength: 20, hasNext: false } },
      isLoading: false,
      error: null,
    }),
  }
})

function renderList(path = "/requests") {
  return render(
    <TooltipProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/requests" element={<RequestsPage />} />
        </Routes>
      </MemoryRouter>
    </TooltipProvider>,
  )
}

const sampleRequest: CatalogRequest = {
  name: "DHC-2026-00001",
  status: "Ouverte",
  deliveryDate: "2026-09-02",
  modified: "2026-08-31 10:00:00",
  creation: "2026-08-31",
  itemCount: 2,
  canCancel: true,
}

describe("liste demandes hors catalogue", () => {
  beforeEach(() => {
    mocks.items = []
  })

  it("affiche la barre de filtres et le bouton nouvelle demande", () => {
    renderList()
    expect(screen.getByRole("heading", { name: "Demandes" })).toBeVisible()
    expect(screen.getByRole("textbox", { name: "Rechercher une demande" })).toBeVisible()
    expect(screen.getByRole("combobox", { name: "Statut" })).toHaveTextContent("Statut")
    expect(screen.getByRole("button", { name: "Période" })).toHaveTextContent("Période")
    expect(screen.getByRole("button", { name: "Trier par" })).toHaveTextContent("Date de demande")
    expect(screen.getByRole("button", { name: "Décroissant" })).toBeInTheDocument()
    expect(screen.getAllByRole("button", { name: "Nouvelle demande" }).length).toBeGreaterThan(0)
    expect(screen.getByText("Aucune demande")).toBeVisible()
  })

  it("propose de réinitialiser quand aucun résultat ne correspond aux filtres", () => {
    renderList("/requests?status=Refusée")
    expect(screen.getByText("Aucune demande ne correspond")).toBeVisible()
    expect(screen.getAllByRole("button", { name: "Réinitialiser" }).length).toBeGreaterThan(0)
  })

  it("liste une demande et le lien vers le détail", () => {
    mocks.items = [sampleRequest]
    renderList()
    expect(screen.getAllByRole("link", { name: "Consulter DHC-2026-00001" })[0]).toHaveAttribute(
      "href",
      "/requests/DHC-2026-00001",
    )
    expect(screen.getAllByText("Ouverte").length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: "Trier par Date" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Trier par Livraison" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Trier par Articles" })).toBeVisible()
    expect(screen.getByRole("columnheader", { name: /Date/ })).toHaveAttribute("aria-sort", "descending")
  })

  it("inverse le tri au clic sur l'en-tête de colonne", async () => {
    const user = userEvent.setup()
    mocks.items = [sampleRequest]
    renderList()
    await user.click(screen.getByRole("button", { name: "Trier par Date" }))
    expect(screen.getByRole("button", { name: "Trier par" })).toHaveTextContent("Date de demande")
    expect(screen.getByRole("button", { name: "Croissant" })).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: /Date/ })).toHaveAttribute("aria-sort", "ascending")
    await user.click(screen.getByRole("button", { name: "Trier par Livraison" }))
    expect(screen.getByRole("button", { name: "Trier par" })).toHaveTextContent("Date de livraison")
    expect(screen.getByRole("columnheader", { name: /Livraison/ })).toHaveAttribute("aria-sort", "descending")
  })
})
