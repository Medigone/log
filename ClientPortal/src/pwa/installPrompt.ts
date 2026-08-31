export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

type PromptListener = (event: BeforeInstallPromptEvent | null) => void

let deferredPrompt: BeforeInstallPromptEvent | null = null
const listeners = new Set<PromptListener>()
let capturing = false

export function captureInstallPrompt(win: Window = window) {
  if (capturing) return
  capturing = true
  win.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault()
    deferredPrompt = event as BeforeInstallPromptEvent
    listeners.forEach((listener) => listener(deferredPrompt))
  })
  win.addEventListener("appinstalled", () => {
    deferredPrompt = null
    listeners.forEach((listener) => listener(null))
  })
}

export function getDeferredInstallPrompt() {
  return deferredPrompt
}

export function subscribeInstallPrompt(listener: PromptListener) {
  listeners.add(listener)
  listener(deferredPrompt)
  return () => {
    listeners.delete(listener)
  }
}

export async function promptInstall() {
  if (!deferredPrompt) return "unavailable" as const
  const event = deferredPrompt
  await event.prompt()
  const choice = await event.userChoice
  deferredPrompt = null
  listeners.forEach((listener) => listener(null))
  return choice.outcome
}
