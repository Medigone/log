import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router-dom"
import { vi } from "vitest"
import { AppSidebar } from "@/layouts/AppSidebar"
import { SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { PortalContext, StorefrontPayload } from "@/shared/types"

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

vi.mock("@/layouts/NavUser", () => ({
  NavUser: () => <div>Compte</div>,
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

function renderSidebar(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar context={context} />
        </SidebarProvider>
      </TooltipProvider>
    </MemoryRouter>,
  )
}

describe("AppSidebar boutique", () => {
  beforeEach(() => {
    stubMatchMedia()
    mocks.storefront.isLoading = false
    mocks.storefront.data = {
      message: {
        hero: { title: "Promo", cta: { type: "catalog", label: "Voir" } },
        banners: [],
        categories: [{ name: "Boissons" }, { name: "Épicerie" }],
        rails: [],
      },
    }
  })

  it("affiche le menu vente et les rayons, sans le suivi de compte", () => {
    renderSidebar()
    expect(screen.getByRole("link", { name: "Accueil" })).toHaveAttribute("href", "/")
    expect(screen.getByRole("link", { name: "Offres" })).toHaveAttribute("href", "/?view=offres")
    expect(screen.getByRole("link", { name: "Catalogue" })).toHaveAttribute("href", "/?view=catalog")
    expect(screen.getByRole("link", { name: "Boissons" })).toHaveAttribute("href", "/?group=Boissons")
    expect(screen.getByRole("link", { name: "Épicerie" })).toHaveAttribute("href", "/?group=%C3%89picerie")
    expect(screen.queryByRole("link", { name: "Commandes" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Panier" })).not.toBeInTheDocument()
    expect(screen.queryByRole("link", { name: "Mon compte" })).not.toBeInTheDocument()
  })

  it("marque le rayon courant comme actif", () => {
    renderSidebar("/?group=Boissons")
    expect(screen.getByRole("link", { name: "Boissons" })).toHaveAttribute("data-active")
    expect(screen.getByRole("link", { name: "Accueil" })).not.toHaveAttribute("data-active")
  })

  it("n'affiche pas la sidebar sur mobile", () => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: query.includes("max-width: 767px"),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }),
    })
    renderSidebar()
    expect(screen.queryByRole("link", { name: "Accueil" })).not.toBeInTheDocument()
  })
})
