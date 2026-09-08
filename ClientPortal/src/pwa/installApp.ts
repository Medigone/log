import { toast } from "sonner"

export async function installAppFromAccount(pwa: {
  isIos: boolean
  canPrompt: boolean
  install: () => Promise<"accepted" | "dismissed" | "unavailable" | undefined>
}) {
  if (pwa.isIos && !pwa.canPrompt) {
    toast.message("Sur iPhone, appuyez sur Partager, puis sur Sur l’écran d’accueil.")
    return
  }
  const outcome = await pwa.install()
  if (outcome === "unavailable") {
    toast.message("L’installation n’est pas proposée par ce navigateur.")
  }
}
