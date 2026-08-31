import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { vi } from "vitest"
import { CartProvider } from "@/cart/CartContext"
import { MobileTabBar } from "@/layouts/MobileTabBar"
import type { StorefrontPayload } from "@/shared/types"

const mocks = vi.hoisted(() => ({
  storefront: {
    data: { message: null as StorefrontPayload | null },
    isLoading: false,
    error: null as Error | null,
  },
}))

vi.mock("@/shared/api", () => ({
  useStorefront: () => mocks.storefront,
}))

function renderBar(path = "/", cartUser = "client@example.com") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CartProvider user={cartUser}>
        <MobileTabBar />
      </CartProvider>
    </MemoryRouter>,
  )
}

describe("barre inférieure mobile", () => {
  beforeEach(() => {
    window.localStorage.clear()
    mocks.storefront.data = {
      message: {
        hero: { title: "Promo", cta: { type: "catalog", label: "Voir" } },
        banners: [{ title: "Promo", campaign: "CAMP-1", cta: { type: "catalog", label: "Voir" } }],
        categories: [],
        rails: [{ kind: "campaign", campaign: "CAMP-1", title: "Offres", cta: { type: "catalog", label: "Voir" }, items: [] }],
      },
    }
  })

  it("affiche le badge promotions réel et le badge panier", () => {
    window.localStorage.setItem(
      "intrapro-client.cart.client@example.com",
      JSON.stringify([{ itemCode: "ART-1", quantity: 2, itemName: "Eau", itemGroup: "Boissons", uom: "Unité", unitPriceTtc: 10, currency: "DZD" }]),
    )
    renderBar()
    expect(screen.getByRole("link", { name: "Promotions, 1" })).toBeVisible()
    expect(screen.getByRole("link", { name: "Panier, 2" })).toHaveAttribute("href", "/cart")
    expect(screen.queryByRole("link", { name: "Catalogue" })).not.toBeInTheDocument()
  })

  it("n’affiche pas de badge promotions sans offres", () => {
    mocks.storefront.data = {
      message: {
        hero: { title: "", cta: { type: "catalog", label: "" } },
        banners: [],
        categories: [],
        rails: [],
      },
    }
    renderBar()
    expect(screen.getByRole("link", { name: "Promotions" })).toBeVisible()
    expect(screen.queryByRole("link", { name: /Promotions,/ })).not.toBeInTheDocument()
  })

  it("marque le panier actif sur /cart", () => {
    renderBar("/cart")
    expect(screen.getByRole("link", { name: "Panier" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Accueil" })).not.toHaveAttribute("aria-current")
  })
})
