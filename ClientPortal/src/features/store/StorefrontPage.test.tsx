import { MemoryRouter } from "react-router-dom"
import { render, screen, waitFor } from "@testing-library/react"
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
    mutate: vi.fn(),
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
        total: 1,
      },
    },
    isLoading: false,
    error: null,
    mutate: vi.fn(),
  },
  recent: {
    data: { message: { items: [] } },
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
    useRecentOrderItems: () => mocks.recent,
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
    mocks.catalog.isLoading = false
    mocks.catalog.data.message.hasNext = false
    mocks.catalog.data.message.page = 1
    mocks.track.mockResolvedValue(undefined)
    mocks.storefront.data = {
      message: {
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

  it("affiche un accueil identique au catalogue, sans rails merchandising", () => {
    render(
      <MemoryRouter>
        <CartProvider user="client@example.com">
          <StorefrontPage context={context} />
        </CartProvider>
      </MemoryRouter>,
    )
    expect(screen.queryByRole("heading", { name: "Boutique" })).not.toBeInTheDocument()
    expect(screen.queryByText(/Bonjour/)).not.toBeInTheDocument()
    expect(screen.queryByText("Offres du moment")).not.toBeInTheDocument()
    expect(screen.queryByRole("heading", { name: "Cheveux" })).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Tous" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Boissons" })).toBeVisible()
    expect(screen.queryByRole("heading", { name: "Catalogue" })).not.toBeInTheDocument()
    expect(screen.getByText("1 article disponible")).toBeVisible()
    expect(screen.getByRole("button", { name: "Demander un article" })).toHaveAttribute("href", "/requests")
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
    expect(screen.queryByRole("heading", { name: "Catalogue" })).not.toBeInTheDocument()
    expect(screen.getByText("1 article disponible")).toBeVisible()
    expect(screen.getByRole("button", { name: "Tous" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Boissons" })).toHaveAttribute("href", "/?group=Boissons")
    expect(screen.queryByRole("button", { name: "Tous les groupes" })).not.toBeInTheDocument()
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

  it("affiche le bandeau promotionnel sur l'accueil, avant les produits", () => {
    const banner = {
      campaign: "pkr0i0ngle",
      placement: "Bandeau",
      title: "Promotion Biomil",
      body: "Profitez de 10 % de remise sur une sélection Biomil.",
      cta: { type: "catalog" as const, label: "Commander" },
      offer: { type: "percentage" as const, percentage: 10, label: "-10 %" },
      offerLabel: "-10 %",
      validUpto: "2026-09-01",
      itemCodes: ["ART-1"],
      itemGroups: ["Nutrition"],
      items: [
        {
          itemCode: "ART-BIO",
          itemName: "Biomil 1",
          itemGroup: "Nutrition",
          uom: "Unité",
          image: "/files/biomil.png",
          unitPriceTtc: 90,
          currency: "DZD",
        },
      ],
    }
    mocks.storefront.data = {
      message: {
        campaigns: [banner],
        banners: [banner],
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
    expect(screen.getByRole("heading", { name: "Promotion Biomil" })).toBeVisible()
    expect(screen.getByText("-10 %")).toBeVisible()
    expect(screen.getByText(/Jusqu’au 1er septembre/)).toBeVisible()
    expect(screen.getByRole("button", { name: "Commander" })).toHaveAttribute("href", "/?campaign=pkr0i0ngle")
    expect(screen.getByText("Article promo")).toBeVisible()
  })

  it("place les contrôles du carrousel sous les bandeaux, sans recouvrir le texte", () => {
    const first = {
      campaign: "CAMP-A",
      placement: "Bandeau",
      title: "Promo A",
      body: "Première offre",
      cta: { type: "catalog" as const, label: "Commander" },
      items: [],
    }
    const second = {
      campaign: "CAMP-B",
      placement: "Bandeau",
      title: "Promo B",
      body: "Deuxième offre",
      cta: { type: "catalog" as const, label: "Commander" },
      items: [],
    }
    mocks.storefront.data = {
      message: {
        campaigns: [first, second],
        banners: [first, second],
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
    expect(screen.getAllByRole("heading", { name: "Promo A" }).length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: "Promotion précédente" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Promotion suivante" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Mettre le carrousel en pause" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Promotion précédente" }).parentElement).not.toHaveClass("absolute")
    expect(screen.queryByRole("button", { name: "Promotion précédente" })?.closest(".relative")).toBeNull()
  })

  it("met le carrousel en pause puis le relance", async () => {
    const user = userEvent.setup()
    const first = {
      campaign: "CAMP-A",
      placement: "Bandeau",
      title: "Promo A",
      cta: { type: "catalog" as const, label: "Commander" },
      items: [],
    }
    const second = {
      campaign: "CAMP-B",
      placement: "Bandeau",
      title: "Promo B",
      cta: { type: "catalog" as const, label: "Commander" },
      items: [],
    }
    mocks.storefront.data = {
      message: {
        campaigns: [first, second],
        banners: [first, second],
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
    await user.click(screen.getByRole("button", { name: "Mettre le carrousel en pause" }))
    expect(screen.getByRole("button", { name: "Lire le carrousel" })).toHaveAttribute("aria-pressed", "true")
    await user.click(screen.getByRole("button", { name: "Lire le carrousel" }))
    expect(screen.getByRole("button", { name: "Mettre le carrousel en pause" })).toHaveAttribute("aria-pressed", "false")
  })

  it("filtre le catalogue Accueil lorsqu'une campagne est active", () => {
    const banner = {
      campaign: "pkr0i0ngle",
      placement: "Bandeau",
      title: "Promotion Biomil",
      cta: { type: "catalog" as const, label: "Commander" },
      items: [],
    }
    mocks.storefront.data = {
      message: {
        campaigns: [banner],
        banners: [banner],
        categories: [{ name: "Boissons" }],
        rails: [],
      },
    }
    render(
      <MemoryRouter initialEntries={["/?campaign=pkr0i0ngle"]}>
        <CartProvider user="client@example.com">
          <StorefrontPage context={context} />
        </CartProvider>
      </MemoryRouter>,
    )
    expect(screen.getByText("Filtre promotionnel actif")).toBeVisible()
    expect(screen.getByRole("button", { name: "Afficher tous les articles" })).toBeVisible()
    expect(screen.getByText("Article promo")).toBeVisible()
    expect(screen.getByText("Promotion Biomil")).toBeVisible()
  })

  it("insère la carte rayon seulement dans le rayon concerné", () => {
    const rail = {
      campaign: "CAMP-RAIL",
      placement: "Rayon produits",
      title: "Promo nutrition",
      body: "Sélection du rayon",
      cta: { type: "catalog" as const, label: "Voir" },
      offerLabel: "-15 %",
      itemCodes: ["ART-1"],
      itemGroups: ["Boissons"],
      items: mocks.catalog.data.message.items,
    }
    mocks.storefront.data = {
      message: {
        campaigns: [rail],
        banners: [],
        categories: [{ name: "Boissons" }, { name: "Épicerie" }],
        rails: [rail],
      },
    }
    const { unmount } = render(
      <MemoryRouter initialEntries={["/?group=Boissons"]}>
        <CartProvider user="client@example.com">
          <StorefrontPage context={context} />
        </CartProvider>
      </MemoryRouter>,
    )
    expect(screen.getByRole("heading", { name: "Promo nutrition" })).toBeVisible()
    unmount()
    render(
      <MemoryRouter initialEntries={["/?group=Épicerie"]}>
        <CartProvider user="client@example.com">
          <StorefrontPage context={context} />
        </CartProvider>
      </MemoryRouter>,
    )
    expect(screen.queryByRole("heading", { name: "Promo nutrition" })).not.toBeInTheDocument()
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
    expect(screen.getByText("Sur devis")).toBeVisible()
    expect(screen.queryByText(/0/)).toBeNull()
    await user.click(screen.getByRole("button", { name: "Ajouter au panier" }))
    expect(screen.getByRole("button", { name: /Ajout/ })).toBeVisible()
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
    expect(screen.getByRole("button", { name: "Ajouter au panier" })).toHaveClass("w-full")
    await user.click(screen.getByRole("button", { name: "Ajouter au panier" }))
    const stored = JSON.parse(window.localStorage.getItem("intrapro-client.cart.client@example.com") || "[]")
    expect(stored[0].itemCode).toBe("ART-QTY")
    expect(stored[0].quantity).toBe(3)
    expect(screen.getByLabelText("Dans le panier · 3")).toHaveTextContent("3")
    expect(screen.getByLabelText("Dans le panier · 3")).not.toHaveTextContent("Dans le panier")
    expect(screen.getByRole("button", { name: /Ajout/ })).toBeVisible()
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
    await user.click(screen.getByRole("button", { name: "Ajouter au panier" }))
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
    expect(screen.getByText("TTC")).toBeVisible()
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

  it("remonte en haut du catalogue après un changement de pagination", async () => {
    const user = userEvent.setup()
    const scrollIntoView = vi.fn()
    const scrollTo = vi.fn()
    HTMLElement.prototype.scrollIntoView = scrollIntoView
    window.scrollTo = scrollTo
    mocks.catalog.data.message.hasNext = true
    render(
      <MemoryRouter>
        <CartProvider user="client@example.com">
          <StorefrontPage context={context} />
        </CartProvider>
      </MemoryRouter>,
    )
    expect(scrollIntoView).not.toHaveBeenCalled()
    expect(scrollTo).not.toHaveBeenCalled()
    await user.click(screen.getByRole("button", { name: "Go to next page" }))
    await waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" })
    })
    expect(scrollTo).not.toHaveBeenCalled()
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
    expect(container.querySelector("[data-slot=card]")).toHaveClass("h-full", "rounded-xl")
    const media = container.querySelector("a[href='/products/ART-ALIGN']")
    expect(media).toHaveClass("aspect-[4/3]", "overflow-hidden", "rounded-lg", "bg-muted")
    expect(container.querySelector("img")).toHaveClass("absolute", "object-contain")
    expect(container.querySelector("[data-slot=card-footer]")).toHaveClass("mt-auto", "border-0", "bg-transparent")
    expect(screen.getByText("Cheveux")).toBeVisible()
    expect(screen.queryByText("Soin démêlant")).not.toBeInTheDocument()
  })

  it("propose une demande hors catalogue quand la recherche est vide", () => {
    const original = mocks.catalog.data.message
    mocks.catalog.data = {
      message: { ...original, items: [], total: 0, hasNext: false },
    }
    try {
      render(
        <MemoryRouter initialEntries={["/?q=crème%20inconnue"]}>
          <CartProvider user="client@example.com">
            <StorefrontPage context={context} />
          </CartProvider>
        </MemoryRouter>,
      )
      expect(screen.getByText("Aucun article ne correspond à votre recherche.")).toBeVisible()
      expect(screen.getByRole("button", { name: "Demander cet article" })).toHaveAttribute(
        "href",
        "/requests/new?q=cr%C3%A8me%20inconnue",
      )
    } finally {
      mocks.catalog.data = { message: original }
    }
  })
})
