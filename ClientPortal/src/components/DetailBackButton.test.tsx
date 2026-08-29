import { MemoryRouter } from "react-router-dom"
import { render, screen } from "@testing-library/react"
import { DetailBackButton } from "@/components/DetailBackButton"

describe("DetailBackButton", () => {
  it("reste visible et pointe vers la liste parente", () => {
    render(
      <MemoryRouter>
        <DetailBackButton to="/orders" label="Retour aux commandes" />
      </MemoryRouter>,
    )

    const link = screen.getByRole("button", { name: "Retour aux commandes" })
    expect(link).toHaveAttribute("href", "/orders")
    expect(link).not.toHaveClass("hidden")
  })
})
