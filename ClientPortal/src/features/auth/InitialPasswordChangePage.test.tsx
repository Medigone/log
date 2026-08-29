import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi } from "vitest"
import { InitialPasswordChangePage } from "@/features/auth/InitialPasswordChangePage"

const mocks = vi.hoisted(() => ({ changeInitialPassword: vi.fn() }))

vi.mock("@/shared/api", async () => {
  const actual = await vi.importActual<typeof import("@/shared/api")>("@/shared/api")
  return {
    ...actual,
    usePasswordActions: () => ({ changeInitialPassword: mocks.changeInitialPassword, changing: false }),
  }
})

describe("changement du mot de passe initial", () => {
  beforeEach(() => vi.clearAllMocks())

  it("bloque une confirmation différente", async () => {
    const user = userEvent.setup()
    render(<InitialPasswordChangePage email="client@example.com" onComplete={vi.fn()} />)

    await user.type(screen.getByLabelText("Mot de passe temporaire"), "Temporary#123")
    await user.type(screen.getByLabelText(/^Nouveau mot de passe/), "NouveauMotDePasse#123")
    await user.type(screen.getByLabelText("Confirmer le nouveau mot de passe"), "AutreMotDePasse#123")
    await user.click(screen.getByRole("button", { name: "Enregistrer et accéder au portail" }))

    expect(screen.getByText(/confirmation ne correspond pas/i)).toBeVisible()
    expect(mocks.changeInitialPassword).not.toHaveBeenCalled()
  })

  it("envoie le mot de passe courant et le nouveau puis lève la garde", async () => {
    mocks.changeInitialPassword.mockResolvedValue({ success: true, mustChangePassword: false })
    const onComplete = vi.fn()
    const user = userEvent.setup()
    render(<InitialPasswordChangePage email="client@example.com" onComplete={onComplete} />)

    await user.type(screen.getByLabelText("Mot de passe temporaire"), "Temporary#123")
    await user.type(screen.getByLabelText(/^Nouveau mot de passe/), "NouveauMotDePasse#123")
    await user.type(screen.getByLabelText("Confirmer le nouveau mot de passe"), "NouveauMotDePasse#123")
    await user.click(screen.getByRole("button", { name: "Enregistrer et accéder au portail" }))

    expect(mocks.changeInitialPassword).toHaveBeenCalledWith({
      currentPassword: "Temporary#123",
      newPassword: "NouveauMotDePasse#123",
    })
    expect(onComplete).toHaveBeenCalledOnce()
  })
})
