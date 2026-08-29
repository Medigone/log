import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { vi } from "vitest"
import { CartProvider } from "@/cart/CartContext"
import { CartPage } from "@/features/cart/CartPage"
import type { PortalContext } from "@/shared/types"

const mocks = vi.hoisted(() => ({
  preview: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}))

vi.mock("@/shared/api", async () => {
  const actual = await vi.importActual<typeof import("@/shared/api")>("@/shared/api")
  return { ...actual, useOrderActions: () => ({ ...mocks, previewing: false, saving: false }) }
})

const context: PortalContext = {
  user: { name: "client@example.com", fullName: "Client", email: "client@example.com" },
  customer: { name: "CUST-1", customerName: "Client test" },
  company: "IntraPro",
  currency: "DZD",
  gpsConfigured: true,
  mustChangePassword: false,
  balances: [],
}

const cart = [{ itemCode: "ART-1", itemName: "Article test", itemGroup: "Produits", uom: "Unité", unitPriceTtc: 100, currency: "DZD", quantity: 2 }]

function renderCheckout(portalContext = context) {
  window.localStorage.setItem("intrapro-client.cart.client@example.com", JSON.stringify(cart))
  return render(<MemoryRouter initialEntries={["/cart"]}><CartProvider user="client@example.com"><Routes><Route path="/cart" element={<CartPage context={portalContext} />} /><Route path="/orders/:orderId" element={<div>Commande créée</div>} /></Routes></CartProvider></MemoryRouter>)
}

describe("checkout client", () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.clearAllMocks()
    mocks.preview.mockResolvedValue({
      items: [
        { itemCode: "ART-1", itemName: "Article test", quantity: 2, unitPriceTtc: 90, lineTotalTtc: 180, isFreeItem: false },
        { itemCode: "ART-FREE", itemName: "Produit offert", quantity: 1, unitPriceTtc: 0, lineTotalTtc: 0, isFreeItem: true },
      ],
      totalQuantity: 3,
      totalTtc: 180,
      discountAmount: 20,
      currency: "DZD",
      deliveryDate: "2026-08-28",
      requiresGps: false,
    })
    mocks.create.mockResolvedValue({ name: "SO-PORTAL-1" })
  })

  it("recalcule les prix côté serveur avant de créer la commande", async () => {
    const user = userEvent.setup()
    renderCheckout()
    await user.click(screen.getByRole("button", { name: "Vérifier avant de confirmer" }))
    expect(await screen.findByText(/180/)).toBeVisible()
    expect(screen.getByText(/Offert · Produit offert/)).toBeVisible()
    expect(screen.getByText(/Remise/)).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Confirmer la commande" }))
    await screen.findByText("Commande créée")
    expect(mocks.preview).toHaveBeenCalledTimes(1)
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ items: [{ itemCode: "ART-1", quantity: 2 }] }))
  })

  it("capture une position précise lorsque le Customer n'en possède pas", async () => {
    const getCurrentPosition = vi.fn((success: PositionCallback) => success({ coords: { latitude: 36.75, longitude: 3.05, accuracy: 20 } } as GeolocationPosition))
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition } })
    const user = userEvent.setup()
    renderCheckout({ ...context, gpsConfigured: false })
    await user.click(screen.getByRole("button", { name: "Vérifier avant de confirmer" }))
    await user.click(await screen.findByRole("button", { name: "Confirmer la commande" }))
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ gps: { latitude: 36.75, longitude: 3.05, accuracy: 20 } })))
  })
})
