import { render, screen } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { vi } from "vitest"
import { DeliveryDetailPage } from "@/features/deliveries/DeliveryDetailPage"
import type { DeliverySummary } from "@/shared/types"

const mocks = vi.hoisted(() => ({
  note: null as DeliverySummary | null,
}))

vi.mock("@/shared/api", async () => {
  const actual = await vi.importActual<typeof import("@/shared/api")>("@/shared/api")
  return {
    ...actual,
    useDelivery: () => ({ data: mocks.note ? { message: mocks.note } : null, isLoading: false, error: null }),
  }
})

const note: DeliverySummary = {
  name: "MAT-DN-2026-00003",
  postingDate: "2026-08-22",
  deliveryDate: "2026-08-22",
  status: "Partiellement Livré",
  docstatus: 1,
  totalQuantity: 6,
  totalTtc: 5616,
  currency: "DZD",
  salesOrders: ["SAL-ORD-2026-00003"],
  items: [{ itemCode: "Article 2", itemName: "Biomil 2 400 Gr", quantity: 6, uom: "N°" }],
}

function renderDelivery() {
  return render(
    <MemoryRouter initialEntries={[`/deliveries/${note.name}`]}>
      <Routes>
        <Route path="/deliveries/:deliveryId" element={<DeliveryDetailPage />} />
        <Route path="/orders/:orderId" element={<div>Commande liée</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe("détail bon de livraison portail", () => {
  beforeEach(() => {
    mocks.note = note
  })

  it("affiche un lien vers la commande liée", () => {
    renderDelivery()
    expect(screen.getByText("Commande liée")).toBeVisible()
    const links = screen.getAllByRole("link", { name: "SAL-ORD-2026-00003" })
    expect(links.length).toBeGreaterThan(0)
    expect(links[0]).toHaveAttribute("href", "/orders/SAL-ORD-2026-00003")
    expect(screen.getByText(/Commande SAL-ORD-2026-00003/)).toBeVisible()
    expect(screen.queryByRole("columnheader", { name: "Photo" })).not.toBeInTheDocument()
    expect(screen.queryByText(/N°/)).not.toBeInTheDocument()
  })
})
