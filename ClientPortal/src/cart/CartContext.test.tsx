import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CartProvider, useCart } from "@/cart/CartContext"
import type { CatalogItem } from "@/shared/types"

const item: CatalogItem = {
  itemCode: "ART-1",
  itemName: "Article test",
  itemGroup: "Produits",
  uom: "Unité",
  unitPriceTtc: 120,
  currency: "DZD",
}

function Harness({ extra }: { extra?: CatalogItem }) {
  const cart = useCart()
  return (
    <>
      <output aria-label="quantité">{cart.count}</output>
      <output aria-label="total">{cart.total}</output>
      <output aria-label="campagne">{cart.lines[0]?.campaign || ""}</output>
      <button onClick={() => cart.add(item)}>Ajouter</button>
      <button onClick={() => cart.add(item, 5)}>Ajouter cinq</button>
      {extra ? <button onClick={() => cart.add(extra)}>Ajouter promo</button> : null}
      <button onClick={() => cart.clear()}>Vider</button>
    </>
  )
}

describe("panier client", () => {
  beforeEach(() => window.localStorage.clear())

  it("persiste séparément le panier de chaque utilisateur", async () => {
    const user = userEvent.setup()
    const { unmount } = render(
      <CartProvider user="client-a@example.com">
        <Harness />
      </CartProvider>,
    )
    await user.click(screen.getByRole("button", { name: "Ajouter" }))
    expect(screen.getByLabelText("quantité")).toHaveTextContent("1")
    expect(screen.getByLabelText("total")).toHaveTextContent("120")
    unmount()

    render(
      <CartProvider user="client-a@example.com">
        <Harness />
      </CartProvider>,
    )
    expect(screen.getByLabelText("quantité")).toHaveTextContent("1")
    expect(window.localStorage.getItem("intrapro-client.cart.client-a@example.com")).toContain("ART-1")
  })

  it("conserve la dernière campagne utilisée comme attribution", async () => {
    const user = userEvent.setup()
    const promoted = { ...item, campaign: "CAMP-2", placement: "Rayon produits" }
    render(
      <CartProvider user="client-a@example.com">
        <Harness extra={promoted} />
      </CartProvider>,
    )
    await user.click(screen.getByRole("button", { name: "Ajouter" }))
    expect(screen.getByLabelText("campagne")).toHaveTextContent("")
    await user.click(screen.getByRole("button", { name: "Ajouter promo" }))
    expect(screen.getByLabelText("campagne")).toHaveTextContent("CAMP-2")
    const stored = JSON.parse(window.localStorage.getItem("intrapro-client.cart.client-a@example.com") || "[]")
    expect(stored[0].campaign).toBe("CAMP-2")
    expect(stored[0].placement).toBe("Rayon produits")
    expect(stored[0].quantity).toBe(2)
  })

  it("ajoute plusieurs unités en une fois", async () => {
    const user = userEvent.setup()
    render(
      <CartProvider user="client-a@example.com">
        <Harness />
      </CartProvider>,
    )
    await user.click(screen.getByRole("button", { name: "Ajouter cinq" }))
    expect(screen.getByLabelText("quantité")).toHaveTextContent("5")
    expect(screen.getByLabelText("total")).toHaveTextContent("600")
  })
})
