import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { vi } from "vitest"
import { SignupPage } from "@/features/signup/SignupPage"

const mocks = vi.hoisted(() => ({
  submit: vi.fn(),
  communes: [{ name: "COM-1", nom: "Oran", wilaya: "Oran", wilayaName: "Oran" }],
  categories: [{ name: "Commercial", label: "Commercial" }],
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

describe("SignupPage", () => {
  beforeEach(() => vi.clearAllMocks())

  it("avance le stepper après l’envoi de la demande", async () => {
    mocks.submit.mockResolvedValue({
      success: true,
      message: "Demande envoyée. Un conseiller vous contactera pour valider le compte.",
    })
    const user = userEvent.setup()
    render(
      <MemoryRouter>
        <SignupPage />
      </MemoryRouter>,
    )
    expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Inscription en ligne")
    await user.type(screen.getByLabelText("Nom commercial"), "Pharmacie Test")
    await user.type(screen.getByLabelText("Prénom"), "Amina")
    await user.type(screen.getByLabelText("Nom"), "Benali")
    await user.click(screen.getByLabelText("Commune"))
    await user.click(screen.getByRole("button", { name: /^oran/i }))
    await user.selectOptions(screen.getByLabelText("Catégorie client"), "Commercial")
    await user.type(screen.getByLabelText("Téléphone"), "0550123456")
    await user.type(screen.getByLabelText("E-mail"), "amina@example.com")
    await user.click(screen.getByRole("button", { name: "Envoyer la demande" }))
    await waitFor(() => {
      expect(screen.getByRole("listitem", { current: "step" })).toHaveTextContent("Confirmation par un représentant")
    })
    expect(screen.getByText("Terminé")).toBeInTheDocument()
  })
})
