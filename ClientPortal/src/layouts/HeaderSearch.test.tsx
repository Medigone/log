import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, useLocation } from "react-router-dom"
import { vi } from "vitest"
import { foldSearchTerm, HeaderSearch } from "@/layouts/HeaderSearch"
import type { StorefrontPayload } from "@/shared/types"

const mocks = vi.hoisted(() => ({
  storefront: {
    data: { message: null as StorefrontPayload | null },
    isLoading: false,
    error: null as Error | null,
  },
  item: {
    itemCode: "ART-COCA",
    itemName: "Coca Cola",
    itemGroup: "Boissons",
    uom: "Unité",
    unitPriceTtc: 80,
    currency: "DZD",
  },
}))

vi.mock("@/shared/api", () => ({
  useStorefront: () => mocks.storefront,
  useCatalog: (search: string, _itemGroup: string, _page: number, enabled = true) => {
    if (!enabled) return { data: undefined, isLoading: false, error: null }
    const items = search.toLowerCase().includes("coca") ? [mocks.item] : []
    return {
      data: { message: { items, groups: ["Boissons"], page: 1, pageLength: 5, hasNext: false } },
      isLoading: false,
      error: null,
    }
  },
}))

function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>
}

function renderSearch(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <HeaderSearch />
      <LocationProbe />
    </MemoryRouter>,
  )
}

describe("recherche globale", () => {
  beforeEach(() => {
    mocks.storefront.data = {
      message: {
        hero: { title: "Promo", cta: { type: "catalog", label: "Voir" } },
        banners: [],
        categories: [{ name: "Boissons" }, { name: "Épicerie" }],
        rails: [],
      },
    }
  })

  it("normalise la casse et les accents", () => {
    expect(foldSearchTerm("Épicerie")).toBe("epicerie")
  })

  it("ne montre pas la liste tant que la requête est vide", () => {
    renderSearch()
    expect(screen.getByLabelText("Rechercher un article ou un rayon")).toBeVisible()
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
  })

  it("propose un rayon et navigue vers le catalogue filtré", async () => {
    const user = userEvent.setup()
    renderSearch()
    await user.type(screen.getByRole("combobox"), "bois")
    expect(screen.getByRole("listbox")).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Boissons" }))
    expect(screen.getByTestId("location")).toHaveTextContent("/?group=Boissons")
  })

  it("propose un rayon malgré les accents", async () => {
    const user = userEvent.setup()
    renderSearch()
    await user.type(screen.getByRole("combobox"), "epic")
    expect(screen.getByRole("button", { name: "Épicerie" })).toBeVisible()
  })

  it("propose un article et ouvre sa fiche", async () => {
    const user = userEvent.setup()
    renderSearch()
    await user.type(screen.getByRole("combobox"), "coca")
    expect(await screen.findByRole("button", { name: /Coca Cola/ })).toBeVisible()
    await user.click(screen.getByRole("button", { name: /Coca Cola/ }))
    expect(screen.getByTestId("location")).toHaveTextContent("/products/ART-COCA")
  })

  it("lance la recherche catalogue sur Entrée sans suggestion surlignée", async () => {
    const user = userEvent.setup()
    renderSearch()
    await user.type(screen.getByRole("combobox"), "coca")
    await user.keyboard("{Enter}")
    expect(screen.getByTestId("location")).toHaveTextContent("/?q=coca")
  })

  it("sélectionne le rayon avec les flèches puis Entrée", async () => {
    const user = userEvent.setup()
    renderSearch()
    await user.type(screen.getByRole("combobox"), "bois")
    await user.keyboard("{ArrowDown}{Enter}")
    expect(screen.getByTestId("location")).toHaveTextContent("/?group=Boissons")
  })

  it("rétablit le catalogue quand on vide la barre", async () => {
    const user = userEvent.setup()
    renderSearch("/?q=coca")
    await user.clear(screen.getByRole("combobox"))
    expect(screen.getByTestId("location")).toHaveTextContent("/")
    expect(screen.getByTestId("location")).not.toHaveTextContent("q=")
  })

  it("conserve le rayon et retire seulement la recherche", async () => {
    const user = userEvent.setup()
    renderSearch("/?group=Boissons&q=coca")
    await user.clear(screen.getByRole("combobox"))
    expect(screen.getByTestId("location")).toHaveTextContent("/?group=Boissons")
  })

  it("affiche un badge pour le rayon actif et permet de le retirer", async () => {
    const user = userEvent.setup()
    renderSearch("/?group=Boissons")
    expect(screen.getByRole("button", { name: "Retirer le rayon Boissons" })).toBeVisible()
    await user.click(screen.getByRole("button", { name: "Retirer le rayon Boissons" }))
    expect(screen.getByTestId("location")).toHaveTextContent("/")
  })
})
