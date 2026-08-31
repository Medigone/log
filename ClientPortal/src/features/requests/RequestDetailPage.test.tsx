import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { vi } from "vitest"
import { TooltipProvider } from "@/components/ui/tooltip"
import { RequestDetailPage } from "@/features/requests/RequestDetailPage"
import type { CatalogRequest } from "@/shared/types"

const mocks = vi.hoisted(() => ({
  request: null as CatalogRequest | null,
}))

vi.mock("@/shared/api", async () => {
  const actual = await vi.importActual<typeof import("@/shared/api")>("@/shared/api")
  return {
    ...actual,
    useCatalogRequest: () => ({
      data: mocks.request ? { message: mocks.request } : null,
      isLoading: false,
      error: null,
      mutate: vi.fn(),
    }),
    useCatalogRequestActions: () => ({ create: vi.fn(), cancel: vi.fn(), saving: false }),
  }
})

function renderDetail(listSearch?: string) {
  return render(
    <TooltipProvider>
      <MemoryRouter
        initialEntries={[
          {
            pathname: `/requests/${mocks.request?.name || "DHC-2026-00001"}`,
            state: listSearch ? { listSearch } : undefined,
          },
        ]}
      >
        <Routes>
          <Route path="/requests/:requestId" element={<RequestDetailPage />} />
          <Route path="/requests" element={<div>Liste demandes</div>} />
          <Route path="/orders/:orderId" element={<div>Commande</div>} />
        </Routes>
      </MemoryRouter>
    </TooltipProvider>,
  )
}

describe("détail demande hors catalogue", () => {
  it("affiche le retour, le tableau et le récapitulatif", () => {
    mocks.request = {
      name: "DHC-2026-00001",
      status: "Commande créée",
      deliveryDate: "2026-09-02",
      modified: "2026-08-31 10:00:00",
      creation: "2026-08-31",
      itemCount: 1,
      canCancel: false,
      orderId: "SAL-ORD-2026-00009",
      items: [{ name: "row-1", designation: "Crème solaire", quantity: 2, reference: "EAN-1", notes: "Boîte bleue" }],
    }
    renderDetail()
    expect(screen.getByRole("button", { name: "Retour aux demandes" })).toHaveAttribute("href", "/requests")
    expect(screen.getByRole("heading", { name: "DHC-2026-00001" })).toBeVisible()
    expect(screen.getAllByText("Commande créée").length).toBeGreaterThan(0)
    expect(screen.getByRole("columnheader", { name: "Désignation" })).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: "Qté" })).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: "Référence" })).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: "Notes" })).toBeInTheDocument()
    expect(screen.getByRole("columnheader", { name: "Photo" })).toBeInTheDocument()
    expect(screen.getAllByText("Crème solaire").length).toBeGreaterThan(0)
    expect(screen.getByText("Récapitulatif")).toBeVisible()
    expect(screen.getByRole("link", { name: "SAL-ORD-2026-00009" })).toHaveAttribute("href", "/orders/SAL-ORD-2026-00009")
    expect(screen.queryByRole("button", { name: "Annuler la demande" })).not.toBeInTheDocument()
  })

  it("restaure les filtres de liste depuis le bouton retour", () => {
    mocks.request = {
      name: "DHC-2026-00001",
      status: "Ouverte",
      deliveryDate: "2026-09-02",
      modified: "2026-08-31 10:00:00",
      creation: "2026-08-31",
      itemCount: 1,
      canCancel: true,
      items: [{ designation: "Sérum", quantity: 1 }],
    }
    renderDetail("?status=Ouverte")
    expect(screen.getByRole("button", { name: "Retour aux demandes" })).toHaveAttribute(
      "href",
      "/requests?status=Ouverte",
    )
  })

  it("permet d’annuler une demande encore ouverte", () => {
    mocks.request = {
      name: "DHC-2026-00002",
      status: "Ouverte",
      deliveryDate: "2026-09-02",
      modified: "2026-08-31 10:00:00",
      creation: "2026-08-31",
      itemCount: 1,
      canCancel: true,
      items: [{ designation: "Sérum", quantity: 1 }],
    }
    renderDetail()
    expect(screen.getByRole("button", { name: "Annuler la demande" })).toBeVisible()
  })

  it("affiche le motif de refus", () => {
    mocks.request = {
      name: "DHC-2026-00003",
      status: "Refusée",
      deliveryDate: "2026-09-02",
      modified: "2026-08-31 10:00:00",
      creation: "2026-08-31",
      itemCount: 1,
      canCancel: false,
      refusalReason: "Article hors gamme",
      items: [{ designation: "Sérum", quantity: 1 }],
    }
    renderDetail()
    expect(screen.getByText("Demande refusée")).toBeVisible()
    expect(screen.getByText("Article hors gamme")).toBeVisible()
    expect(screen.queryByRole("button", { name: "Annuler la demande" })).not.toBeInTheDocument()
  })
})
