import { MemoryRouter } from "react-router-dom"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi } from "vitest"
import { CartProvider } from "@/cart/CartContext"
import { ProductCard } from "@/features/store/ProductCard"
import { StorefrontPage } from "@/features/store/StorefrontPage"
import type { PortalContext, StorefrontPayload } from "@/shared/types"

const mocks = vi.hoisted(() => ({
  storefront: {
    data: { message: null as StorefrontPayload | null },
    isLoading: false,
    error: null as Error | null,
  },
  catalog: {
    data: {
      message: {
        items: [
          {
            itemCode: "ART-1",
            itemName: "Article promo",
            itemGroup: "Boissons",
            uom: "Unité",
            showPrice: true,
            unitPriceTtc: 80,
            catalogPriceTtc: 100,
            currency: "DZD",
            offerLabel: "-20 %",
          },
        ],
        groups: ["Boissons"],
        page: 1,
        pageLength: 12,
        hasNext: false,
      },
    },
    isLoading: false,
    error: null,
  },
  track: vi.fn(),
}))

vi.mock("@/shared/api", async () => {
  const actual = await vi.importActual<typeof import("@/shared/api")>("@/shared/api")
  return {
    ...actual,
    useStorefront: () => mocks.storefront,
    useCatalog: () => mocks.catalog,
    usePromotionEvents: () => ({ track: mocks.track }),
  }
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

describe("boutique portail", () => {
  beforeEach(() => {
    window.localStorage.clear()
    mocks.track.mockResolvedValue(undefined)
    mocks.storefront.data = {
      message: {
        hero: {
          campaign: "CAMP-1",
          title: "Promo été",
          body: "Remises automatiques",
          cta: { type: "catalog", label: "Voir le catalogue" },
          offerLabel: "-10 %",
        },
        banners: [],
        categories: [{ name: "Boissons" }, { name: "Épicerie" }],
        rails: [
          {
            campaign: "CAMP-1",
            kind: "campaign",
            title: "Offres du moment",
            offerLabel: "-20 %",
            cta: { type: "catalog", label: "Voir" },
            items: mocks.catalog.data.message.items,
          },
          {
            campaign: null,
            kind: "group",
            title: "Cheveux",
            cta: { type: "group", itemGroup: "Cheveux", label: "Voir le groupe" },
            items: [
              {
                itemCode: "ART-RAYON",
                itemName: "Après-shampooing",
                itemGroup: "Cheveux",
                uom: "Unité",
                showPrice: true,
                unitPriceTtc: 690,
                currency: "DZD",
              },
            ],
          },
        ],
      },
    }
  })

  it("affiche un accueil orienté achat avec promotions, sans filtres locaux", () => {
    render(
      <MemoryRouter>
        <CartProvider user="client@example.com">
          <StorefrontPage context={context} />
        </CartProvider>
      </MemoryRouter>,
    )
    expect(screen.queryByRole("heading", { name: "Boutique" })).not.toBeInTheDocument()
    expect(screen.queryByText(/Bonjour/)).not.toBeInTheDocument()
    expect(screen.queryByText("Promo été")).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Catégories" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Boissons" })).not.toBeInTheDocument()
    expect(screen.getByText("Offres du moment")).toBeVisible()
    expect(screen.getByRole("heading", { name: "Cheveux" })).toBeVisible()
    expect(screen.getByRole("heading", { name: "Catalogue" })).toBeVisible()
    expect(screen.queryByLabelText("Rechercher un article")).not.toBeInTheDocument()
  })

  it("affiche le nom du rayon dans le titre catalogue", () => {
    render(
      <MemoryRouter initialEntries={["/?group=Boissons"]}>
        <CartProvider user="client@example.com">
          <StorefrontPage context={context} />
        </CartProvider>
      </MemoryRouter>,
    )
    expect(screen.getByRole("heading", { name: "Catalogue · Boissons" })).toBeVisible()
    expect(screen.queryByText("Promo été")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Tous les groupes" })).toHaveAttribute("href", "/?view=catalog")
  })

  it("n'affiche que les promotions sur la vue offres", () => {
    render(
      <MemoryRouter initialEntries={["/?view=offres"]}>
        <CartProvider user="client@example.com">
          <StorefrontPage context={context} />
        </CartProvider>
      </MemoryRouter>,
    )
    expect(screen.queryByRole("heading", { name: "Offres" })).not.toBeInTheDocument()
    expect(screen.queryByText("Promo été")).not.toBeInTheDocument()
    expect(screen.getByText("Offres du moment")).toBeVisible()
    expect(screen.getAllByText("-20 %")).toHaveLength(1)
    expect(screen.queryByRole("heading", { name: "Cheveux" })).not.toBeInTheDocument()
    expect(screen.queryByText("Après-shampooing")).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Catalogue" })).not.toBeInTheDocument()
  })

  it("n'affiche pas le hero", () => {
    mocks.storefront.data = {
      message: {
        hero: {
          title: "Commandez vos produits",
          cta: { type: "catalog", label: "Parcourir le catalogue" },
        },
        banners: [],
        categories: [{ name: "Boissons" }],
        rails: [],
      },
    }
    render(
      <MemoryRouter>
        <CartProvider user="client@example.com">
          <StorefrontPage context={context} />
        </CartProvider>
      </MemoryRouter>,
    )
    expect(screen.queryByRole("heading", { name: "Commandez vos produits" })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Parcourir le catalogue" })).not.toBeInTheDocument()
  })

  it("n'affiche pas 0 DZD lorsque le prix est masqué", async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <CartProvider user="client@example.com">
          <ProductCard
            item={{
              itemCode: "ART-HIDE",
              itemName: "Article masqué",
              itemGroup: "Boissons",
              uom: "Unité",
              showPrice: false,
              unitPriceTtc: null,
              currency: "DZD",
            }}
          />
        </CartProvider>
      </MemoryRouter>,
    )
    expect(screen.getByText("Prix sur demande")).toBeVisible()
    expect(screen.queryByText(/0/)).toBeNull()
    await user.click(screen.getByRole("button", { name: "Ajouter" }))
    expect(screen.getByRole("button", { name: "Ajouter encore" })).toBeEnabled()
    expect(screen.getByLabelText("Dans le panier · 1")).toBeVisible()
  })

  it("ajoute au panier la quantité choisie sur la carte", async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <CartProvider user="client@example.com">
          <ProductCard
            item={{
              itemCode: "ART-QTY",
              itemName: "Article quantité",
              itemGroup: "Boissons",
              uom: "Unité",
              showPrice: true,
              unitPriceTtc: 50,
              currency: "DZD",
            }}
          />
        </CartProvider>
      </MemoryRouter>,
    )
    await user.click(screen.getByRole("button", { name: "Augmenter Article quantité" }))
    await user.click(screen.getByRole("button", { name: "Augmenter Article quantité" }))
    expect(screen.getByLabelText("Quantité Article quantité")).toHaveValue(3)
    expect(screen.getByLabelText("Quantité Article quantité")).toHaveClass("text-center")
    expect(screen.getByRole("button", { name: "Ajouter" })).toHaveClass("w-full", "rounded-full")
    await user.click(screen.getByRole("button", { name: "Ajouter" }))
    const stored = JSON.parse(window.localStorage.getItem("intrapro-client.cart.client@example.com") || "[]")
    expect(stored[0].itemCode).toBe("ART-QTY")
    expect(stored[0].quantity).toBe(3)
    expect(screen.getByLabelText("Dans le panier · 3")).toHaveTextContent("3")
    expect(screen.getByLabelText("Dans le panier · 3")).not.toHaveTextContent("Dans le panier")
    expect(screen.getByRole("button", { name: "Ajouter encore" })).toBeVisible()
  })

  it("affiche un badge compact sur les cartes rayon", async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <CartProvider user="client@example.com">
          <ProductCard
            size="sm"
            item={{
              itemCode: "ART-RAIL",
              itemName: "Article rayon",
              itemGroup: "Boissons",
              uom: "Unité",
              showPrice: true,
              unitPriceTtc: 50,
              currency: "DZD",
            }}
          />
        </CartProvider>
      </MemoryRouter>,
    )
    await user.click(screen.getByRole("button", { name: "Ajouter" }))
    const badge = screen.getByLabelText("Dans le panier · 1")
    expect(badge).toBeVisible()
    expect(badge).toHaveClass("bg-primary", "text-primary-foreground")
    expect(badge).toHaveTextContent("1")
    expect(badge).not.toHaveTextContent("Dans le panier")
  })

  it("barre le prix catalogue seulement quand la remise s'applique à l'unité", () => {
    const { rerender } = render(
      <MemoryRouter>
        <CartProvider user="client@example.com">
          <ProductCard
            item={{
              itemCode: "ART-1",
              itemName: "Article promo",
              itemGroup: "Boissons",
              uom: "Unité",
              showPrice: true,
              unitPriceTtc: 80,
              catalogPriceTtc: 100,
              currency: "DZD",
              offerLabel: "-20 %",
            }}
          />
        </CartProvider>
      </MemoryRouter>,
    )
    expect(screen.getByText(/100/).closest("span")).toHaveClass("line-through")
    expect(screen.getByText("-20 %")).toBeVisible()
    expect(screen.queryByText(/TTC/)).not.toBeInTheDocument()
    rerender(
      <MemoryRouter>
        <CartProvider user="client@example.com">
          <ProductCard
            item={{
              itemCode: "ART-1",
              itemName: "Article palier",
              itemGroup: "Boissons",
              uom: "Unité",
              showPrice: true,
              unitPriceTtc: 100,
              catalogPriceTtc: 100,
              currency: "DZD",
              offerCondition: "dès 5 unités",
            }}
          />
        </CartProvider>
      </MemoryRouter>,
    )
    expect(screen.queryByText(/100/)?.className.includes("line-through")).toBe(false)
    expect(screen.getByText("dès 5 unités")).toBeVisible()
    expect(screen.queryByText("-20 %")).not.toBeInTheDocument()
  })

  it("fixe la hauteur des cartes pour aligner images et actions", () => {
    const { container } = render(
      <MemoryRouter>
        <CartProvider user="client@example.com">
          <ProductCard
            item={{
              itemCode: "ART-ALIGN",
              itemName: "Après-shampooing démêlant 200 ml",
              itemGroup: "Cheveux",
              description: "Soin démêlant",
              uom: "Unité",
              showPrice: true,
              unitPriceTtc: 690,
              currency: "DZD",
              image: "/files/para.jpg",
            }}
          />
        </CartProvider>
      </MemoryRouter>,
    )
    expect(container.querySelector("[data-slot=card]")).toHaveClass("h-full", "rounded-2xl")
    const media = container.querySelector("a[href='/products/ART-ALIGN']")
    expect(media).toHaveClass("aspect-square", "overflow-hidden", "rounded-2xl", "bg-muted")
    expect(container.querySelector("img")).toHaveClass("absolute", "object-contain")
    expect(container.querySelector("[data-slot=card-footer]")).toHaveClass("mt-auto", "border-0", "bg-transparent")
    expect(screen.getByText("Cheveux")).toBeVisible()
    expect(screen.queryByText("Soin démêlant")).not.toBeInTheDocument()
  })
})
