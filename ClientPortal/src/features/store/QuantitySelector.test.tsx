import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { QuantitySelector } from "@/features/store/QuantitySelector"

function Harness({ initial = 1 }: { initial?: number }) {
  const [value, setValue] = useState(initial)
  return <QuantitySelector value={value} onChange={setValue} name="Article test" uom="Unité" compact />
}

describe("sélecteur de quantité", () => {
  it("ne grise pas tout le contrôle quand le bouton moins est inactif", () => {
    render(<Harness />)
    const group = screen.getByLabelText("Quantité Article test").closest("[data-slot=input-group]")
    expect(group).toHaveClass("bg-background", "has-disabled:bg-background", "has-disabled:opacity-100")
    expect(screen.getByRole("button", { name: "Diminuer Article test" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Augmenter Article test" })).toBeEnabled()
  })

  it("garde le fond actif après une augmentation", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole("button", { name: "Augmenter Article test" }))
    expect(screen.getByLabelText("Quantité Article test")).toHaveValue("2")
    expect(screen.getByRole("button", { name: "Diminuer Article test" })).toBeEnabled()
    expect(screen.getByLabelText("Quantité Article test").closest("[data-slot=input-group]")).toHaveClass(
      "has-disabled:opacity-100",
    )
  })

  it("conserve la quantité existante et ajoute les chiffres saisis", async () => {
    const user = userEvent.setup()
    render(<Harness initial={1} />)
    const input = screen.getByLabelText("Quantité Article test")
    await user.click(input)
    expect(input).toHaveValue("1")
    await user.keyboard("2")
    expect(input).toHaveValue("12")
    await user.tab()
    expect(input).toHaveValue("12")
  })

  it("restaure la quantité précédente si le champ est vidé puis quitté", async () => {
    const user = userEvent.setup()
    render(<Harness initial={4} />)
    const input = screen.getByLabelText("Quantité Article test")
    await user.click(input)
    await user.clear(input)
    expect(input).toHaveValue("")
    await user.tab()
    expect(input).toHaveValue("4")
  })
})
