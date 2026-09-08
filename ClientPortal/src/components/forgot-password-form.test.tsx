import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router-dom"
import { vi } from "vitest"
import { ForgotPasswordForm } from "@/components/forgot-password-form"

const mocks = vi.hoisted(() => ({ send: vi.fn() }))

vi.mock("@/shared/api", async () => {
  const actual = await vi.importActual<typeof import("@/shared/api")>("@/shared/api")
  return {
    ...actual,
    usePasswordReset: () => ({ send: mocks.send, sending: false }),
  }
})

function renderForgot() {
  return render(
    <MemoryRouter>
      <ForgotPasswordForm />
    </MemoryRouter>,
  )
}

describe("ForgotPasswordForm", () => {
  beforeEach(() => vi.clearAllMocks())

  it("reproduit le chrome du login Modern Pharma", () => {
    renderForgot()
    expect(screen.getByRole("heading", { name: "Mot de passe oublié" })).toBeInTheDocument()
    expect(screen.getByText("Modern Pharma")).toBeInTheDocument()
    expect(screen.getByLabelText("Identifiant")).toHaveAttribute("type", "text")
    expect(screen.getByRole("button", { name: "Envoyer le lien" })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /retour à la connexion/i })).toHaveAttribute("href", "/login")
    expect(screen.getByText(/commandes et livraisons/i)).toBeInTheDocument()
  })

  it("exige un identifiant avant l’envoi", async () => {
    const user = userEvent.setup()
    renderForgot()
    expect(screen.getByLabelText("Identifiant")).toBeRequired()
    await user.click(screen.getByRole("button", { name: "Envoyer le lien" }))
    expect(mocks.send).not.toHaveBeenCalled()
  })

  it("envoie la demande et confirme l’e-mail", async () => {
    mocks.send.mockResolvedValue({
      ok: true,
      message: "Les instructions de réinitialisation ont été envoyées à votre adresse e-mail.",
    })
    const user = userEvent.setup()
    renderForgot()
    await user.type(screen.getByLabelText("Identifiant"), "client@example.com")
    await user.click(screen.getByRole("button", { name: "Envoyer le lien" }))
    await waitFor(() =>
      expect(screen.getByText(/instructions de réinitialisation ont été envoyées/i)).toBeVisible(),
    )
    expect(mocks.send).toHaveBeenCalledWith("client@example.com")
  })

  it("affiche l’erreur métier renvoyée par l’API", async () => {
    mocks.send.mockResolvedValue({ ok: false, message: "Ce compte est désactivé." })
    const user = userEvent.setup()
    renderForgot()
    await user.type(screen.getByLabelText("Identifiant"), "off@example.com")
    await user.click(screen.getByRole("button", { name: "Envoyer le lien" }))
    await waitFor(() => expect(screen.getByText("Ce compte est désactivé.")).toBeVisible())
  })
})
