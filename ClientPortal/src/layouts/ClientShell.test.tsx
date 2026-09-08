import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { vi } from "vitest"
import { CartProvider } from "@/cart/CartContext"
import { ClientShell, inProgressDeliveryLabel } from "@/layouts/ClientShell"
import type { PortalContext } from "@/shared/types"

vi.mock("@/layouts/AppSidebar", () => ({
  AppSidebar: () => <aside>Navigation</aside>,
}))

vi.mock("@/features/notifications/NotificationButton", () => ({
  NotificationButton: () => (
    <button type="button" aria-label="Notifications">
      Notifications
    </button>
  ),
}))

vi.mock("@/pwa/InstallAppBanner", () => ({
  InstallAppBanner: () => null,
}))

vi.mock("@/shared/api", () => ({
  useStorefront: () => ({
    data: { message: { banners: [], categories: [], rails: [] } },
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

function stubMatchMedia(mobile = false) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: mobile && query.includes("max-width: 767px"),
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
    expect(screen.getByRole("button", { name: "Notifications" })).toBeVisible()
    expect(screen.getByLabelText("Rechercher un article, une référence ou un rayon")).toBeVisible()
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

describe("coquille mobile", () => {
  beforeEach(() => {
    stubMatchMedia(true)
  })

  afterEach(() => {
    stubMatchMedia(false)
  })

  it("remplace la barre latérale par une navigation inférieure à quatre destinations", () => {
    renderShell(context)
    expect(screen.queryByText("Navigation")).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Toggle Sidebar" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Panier" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Catalogue" })).not.toBeInTheDocument()
    expect(screen.queryByText("Changer de client")).not.toBeInTheDocument()
    expect(screen.getByRole("navigation", { name: "Navigation principale" })).toBeVisible()
    expect(screen.getByRole("link", { name: "Accueil" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Promotions" })).toHaveAttribute("href", "/?view=offres")
    expect(screen.getByRole("link", { name: "Panier" })).toHaveAttribute("href", "/cart")
    expect(screen.getByRole("link", { name: "Compte" })).toHaveAttribute("href", "/account")
    expect(screen.getByRole("heading", { name: "Boutique" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Notifications" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Rechercher un article, une référence ou un rayon" })).toBeVisible()
    expect(screen.getByRole("link", { name: "Modern Pharma" })).toBeVisible()
  })

  it("garde Accueil actif sur un rayon et Promotions sur la vue offres", () => {
    const { unmount } = renderShell(context, "/?group=Boissons")
    expect(screen.getByRole("link", { name: "Accueil" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Promotions" })).not.toHaveAttribute("aria-current")
    unmount()
    renderShell(context, "/?view=offres")
    expect(screen.getByRole("heading", { name: "Promotions" })).toBeVisible()
    expect(screen.getByRole("link", { name: "Promotions" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Accueil" })).not.toHaveAttribute("aria-current")
  })

  it("marque Compte actif sur les commandes", () => {
    renderShell(context, "/orders")
    expect(screen.getByRole("link", { name: "Compte" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("heading", { name: "Mes commandes" })).toBeVisible()
  })
})
