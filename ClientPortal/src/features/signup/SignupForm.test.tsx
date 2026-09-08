import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { vi } from "vitest"
import { SignupForm } from "@/features/signup/SignupForm"

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  communes: [
    { name: "COM-1", nom: "Oran", wilaya: "Oran", wilayaName: "Oran" },
    { name: "COM-2", nom: "Bir El Djir", wilaya: "Oran", wilayaName: "Oran" },
  ],
  categories: [
    { name: "Commercial", label: "Commercial" },
    { name: "Grossistes", label: "Grossistes" },
  ],
}))

vi.mock("@/shared/api", async () => {
  const actual = await vi.importActual<typeof import("@/shared/api")>("@/shared/api")
  return {
    ...actual,
    useSignupOptions: () => ({
      data: { message: { communes: mocks.communes, categories: mocks.categories } },
      isLoading: false,
      error: null,
    }),
    useCustomerSignup: () => ({ submit: mocks.submit, sending: false }),
  }
})

function renderSignup() {
  return render(
    <MemoryRouter>
      <SignupForm />
    </MemoryRouter>,
  )
}

describe("SignupForm", () => {
  beforeEach(() => vi.clearAllMocks())

  it("affiche tous les champs obligatoires", () => {
    renderSignup()
    expect(screen.getByRole("heading", { name: "Devenir client" })).toBeInTheDocument()
    expect(screen.getByLabelText("Nom commercial")).toBeRequired()
    expect(screen.getByLabelText("Prénom")).toBeRequired()
    expect(screen.getByLabelText("Nom")).toBeRequired()
    expect(screen.getByLabelText("Commune")).toBeInTheDocument()
    expect(screen.getByLabelText("Catégorie client")).toBeRequired()
    expect(screen.getByLabelText("Téléphone")).toHaveAttribute("type", "tel")
    expect(screen.getByLabelText("E-mail")).toHaveAttribute("type", "email")
    expect(screen.getByRole("button", { name: "Envoyer la demande" })).toBeInTheDocument()
  })

  it("refuse l’envoi sans commune", async () => {
    const user = userEvent.setup()
    renderSignup()
    await user.type(screen.getByLabelText("Nom commercial"), "Pharmacie Test")
    await user.type(screen.getByLabelText("Prénom"), "Amina")
    await user.type(screen.getByLabelText("Nom"), "Benali")
    await user.selectOptions(screen.getByLabelText("Catégorie client"), "Commercial")
    await user.type(screen.getByLabelText("Téléphone"), "0550123456")
    await user.type(screen.getByLabelText("E-mail"), "amina@example.com")
    await user.click(screen.getByRole("button", { name: "Envoyer la demande" }))
    expect(screen.getByText("Tous les champs sont obligatoires.")).toBeVisible()
    expect(mocks.submit).not.toHaveBeenCalled()
  })

  it("envoie la candidature et confirme", async () => {
    mocks.submit.mockResolvedValue({
      success: true,
      message: "Demande envoyée. Un conseiller vous contactera pour valider le compte.",
    })
    const user = userEvent.setup()
    renderSignup()
    await user.type(screen.getByLabelText("Nom commercial"), "Pharmacie Test")
    await user.type(screen.getByLabelText("Prénom"), "Amina")
    await user.type(screen.getByLabelText("Nom"), "Benali")
    await user.click(screen.getByLabelText("Commune"))
    await user.click(screen.getByRole("button", { name: /^oran/i }))
    await user.selectOptions(screen.getByLabelText("Catégorie client"), "Commercial")
    await user.type(screen.getByLabelText("Téléphone"), "0550123456")
    await user.type(screen.getByLabelText("E-mail"), "amina@example.com")
    await user.click(screen.getByRole("button", { name: "Envoyer la demande" }))
    await waitFor(() =>
      expect(screen.getByText(/demande envoyée/i)).toBeVisible(),
    )
    expect(mocks.submit).toHaveBeenCalledWith({
      commercialName: "Pharmacie Test",
      firstName: "Amina",
      lastName: "Benali",
      commune: "COM-1",
      category: "Commercial",
      phone: "0550123456",
      email: "amina@example.com",
    })
  })

  it("affiche l’erreur renvoyée par l’API", async () => {
    mocks.submit.mockRejectedValue({ message: "Un contact existe déjà pour cette adresse e-mail." })
    const user = userEvent.setup()
    renderSignup()
    await user.type(screen.getByLabelText("Nom commercial"), "Pharmacie Test")
    await user.type(screen.getByLabelText("Prénom"), "Amina")
    await user.type(screen.getByLabelText("Nom"), "Benali")
    await user.click(screen.getByLabelText("Commune"))
    await user.click(screen.getByRole("button", { name: /^oran/i }))
    await user.selectOptions(screen.getByLabelText("Catégorie client"), "Commercial")
    await user.type(screen.getByLabelText("Téléphone"), "0550123456")
    await user.type(screen.getByLabelText("E-mail"), "deja@example.com")
    await user.click(screen.getByRole("button", { name: "Envoyer la demande" }))
    await waitFor(() =>
      expect(screen.getByText("Un contact existe déjà pour cette adresse e-mail.")).toBeVisible(),
    )
  })
})
