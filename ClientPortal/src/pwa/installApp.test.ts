import { toast } from "sonner"
import { vi } from "vitest"
import { installAppFromAccount } from "@/pwa/installApp"

vi.mock("sonner", () => ({
  toast: { message: vi.fn() },
}))

describe("installAppFromAccount", () => {
  it("lance le prompt natif hors iOS", async () => {
    const install = vi.fn().mockResolvedValue("accepted")
    await installAppFromAccount({ isIos: false, canPrompt: true, install })
    expect(install).toHaveBeenCalled()
    expect(toast.message).not.toHaveBeenCalled()
  })

  it("explique le geste iOS quand le prompt est absent", async () => {
    const install = vi.fn()
    await installAppFromAccount({ isIos: true, canPrompt: false, install })
    expect(install).not.toHaveBeenCalled()
    expect(toast.message).toHaveBeenCalledWith("Sur iPhone, appuyez sur Partager, puis sur Sur l’écran d’accueil.")
  })

  it("signale un navigateur sans invitation d’installation", async () => {
    const install = vi.fn().mockResolvedValue("unavailable")
    await installAppFromAccount({ isIos: false, canPrompt: false, install })
    expect(toast.message).toHaveBeenCalledWith("L’installation n’est pas proposée par ce navigateur.")
  })
})
