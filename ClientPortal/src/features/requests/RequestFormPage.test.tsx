import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router-dom"
import { vi } from "vitest"
import { RequestFormPage } from "@/features/requests/RequestFormPage"

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
}))

vi.mock("@/shared/api", async () => {
  const actual = await vi.importActual<typeof import("@/shared/api")>("@/shared/api")
  return {
    ...actual,
    useCatalogRequestActions: () => ({ create: mocks.create, cancel: vi.fn(), saving: false }),
  }
})

function renderForm(path = "/requests/new") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/requests/new" element={<RequestFormPage />} />
        <Route path="/requests/:requestId" element={<div>Demande créée</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe("formulaire demande hors catalogue", () => {
  beforeEach(() => {
    mocks.create.mockReset()
    mocks.create.mockResolvedValue({ name: "DHC-2026-00001" })
  })

  it("préremplit la désignation depuis la recherche", () => {
    renderForm("/requests/new?q=Crème%20solaire")
    expect(screen.getByRole("heading", { name: "Demande pour « Crème solaire »" })).toBeVisible()
    expect(screen.getByLabelText("Désignation")).toHaveValue("Crème solaire")
  })

  it("ajoute une ligne puis envoie la demande", async () => {
    const user = userEvent.setup()
    renderForm()
    await user.type(screen.getByLabelText("Désignation"), "Crème solaire")
    await user.click(screen.getByRole("button", { name: "Ajouter un article" }))
    const designations = screen.getAllByLabelText("Désignation")
    expect(designations).toHaveLength(2)
    await user.type(designations[1], "Sérum")
    await user.click(screen.getByRole("button", { name: "Envoyer la demande" }))
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        items: [
          expect.objectContaining({ designation: "Crème solaire", quantity: 1 }),
          expect.objectContaining({ designation: "Sérum", quantity: 1 }),
        ],
      }),
    )
    expect(await screen.findByText("Demande créée")).toBeVisible()
  })
})
