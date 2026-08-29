import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { vi } from "vitest"
import { CartProvider } from "@/cart/CartContext"
import { ClientShell, inProgressDeliveryLabel } from "@/layouts/ClientShell"
import type { PortalContext } from "@/shared/types"

vi.mock("@/layouts/AppSidebar", () => ({
  AppSidebar: () => <aside>Navigation</aside>,
}))

vi.mock("@/layouts/MobileBottomNav", () => ({
  MobileBottomNav: () => <nav>Navigation mobile</nav>,
}))

vi.mock("@/shared/api", () => ({
  useStorefront: () => ({
    data: { message: { hero: { title: "", cta: { type: "catalog", label: "" } }, banners: [], categories: [], rails: [] } },
    isLoading: false,
    error: null,
  }),
  useCatalog: () => ({ data: undefined, isLoading: false, error: null }),
}))

const context: PortalContext = {
  user: { name: "client@example.com", fullName: "Client", email: "client@example.com" },
  customer: { name: "CUST-1", customerName: "Client test" },
  company: "IntraPro",
  currency: "DZD",
  gpsConfigured: true,
  mustChangePassword: false,
  balances: [],
}

function stubMatchMedia() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }),
  })
}

function renderShell(portalContext: PortalContext, path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <CartProvider user="client@example.com">
        <ClientShell context={portalContext}>
          <div>contenu</div>
        </ClientShell>
      </CartProvider>
    </MemoryRouter>,
  )
}

describe("bandeau livraison en cours", () => {
  beforeEach(() => {
    stubMatchMedia()
  })
  it("compose le libellé demandé pour une commande", () => {
    expect(inProgressDeliveryLabel(["SAL-ORD-2026-00005"])).toBe("SAL-ORD-2026-00005")
  })

  it("affiche une alerte avec un bouton pour ouvrir la commande", () => {
    renderShell({ ...context, inProgressOrders: ["SAL-ORD-2026-00005"] })
    expect(screen.getByRole("alert")).toHaveAttribute("data-variant", "warning")
    expect(screen.getByText("Livraison en cours")).toBeVisible()
    expect(screen.getByText("SAL-ORD-2026-00005")).toBeVisible()
    expect(screen.queryByText(/Livraison commande/)).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Voir la commande" })).toHaveAttribute("href", "/orders/SAL-ORD-2026-00005")
    expect(screen.getAllByRole("button", { name: "Panier" }).length).toBeGreaterThan(0)
    expect(screen.getByLabelText("Rechercher un article ou un rayon")).toBeVisible()
  })

  it("n'affiche rien sans tournée démarrée", () => {
    renderShell(context)
    expect(screen.queryByRole("alert")).not.toBeInTheDocument()
  })

  it("affiche le rayon dans le fil d'Ariane", () => {
    renderShell(context, "/?group=Boissons")
    expect(screen.getByRole("navigation", { name: "breadcrumb" })).toHaveTextContent("Boissons")
  })
})
