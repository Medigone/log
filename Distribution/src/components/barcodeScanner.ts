export const SCAN_COOLDOWN_MS = 1500

export type CameraDeviceLike = { id: string; label: string }

export type Html5QrcodeCameraConfig = {
  fps: number
  qrbox?: (viewfinderWidth: number, viewfinderHeight: number) => { width: number; height: number }
}

export type Html5QrcodeLike = {
  start: (
    cameraIdOrConfig: string | MediaTrackConstraints,
    configuration: Html5QrcodeCameraConfig,
    onSuccess: (decodedText: string) => void,
    onError: () => void,
  ) => Promise<null | void>
  stop: () => Promise<void>
  clear: () => void
}

export function cameraErrorMessage(error: unknown) {
  const text = cameraErrorDetail(error)
  if (/Cannot stop, scanner is not running/i.test(text)) {
    return "Le lecteur s’est arrêté trop tôt. Réessayez."
  }
  if (/NotAllowedError|Permission|denied/i.test(text)) {
    return "Autorisez l’accès à la caméra pour scanner."
  }
  if (/OverconstrainedError|overconstrained/i.test(text)) {
    return "La caméra arrière n’est pas disponible. Réessayez ou autorisez une autre caméra."
  }
  if (/NotReadableError|TrackStartError|could not start video source/i.test(text)) {
    return "La caméra n’est pas encore prête. Réessayez."
  }
  if (/NotFoundError|Requested device not found|no camera/i.test(text)) {
    return "Aucune caméra n’a été détectée."
  }
  if (/not ready|HTML Element with id|qrbox/i.test(text)) {
    return "La zone de scan n’est pas prête. Réessayez."
  }
  if (/in use|already.*running|AbortError|play\(\) request was interrupted/i.test(text)) {
    return "La caméra est déjà utilisée. Fermez l’autre application puis réessayez."
  }
  if (/secure|https/i.test(text)) {
    return "La caméra nécessite une connexion sécurisée (HTTPS)."
  }
  return "Impossible d’ouvrir la caméra."
}

export function cameraErrorDetail(error: unknown) {
  if (error instanceof Error) {
    const name = error.name && error.name !== "Error" ? `${error.name}: ` : ""
    return `${name}${error.message}`
  }
  if (typeof error === "string") return error
  if (error && typeof error === "object") {
    const record = error as { message?: unknown; name?: unknown }
    if (typeof record.message === "string") {
      const name = typeof record.name === "string" && record.name !== "Error" ? `${record.name}: ` : ""
      return `${name}${record.message}`
    }
    try {
      return JSON.stringify(error)
    } catch {
      return String(error)
    }
  }
  return String(error)
}

export function pickBackCamera(cameras: CameraDeviceLike[]) {
  if (!cameras.length) return undefined
  const labeled = [...cameras]
    .reverse()
    .find((camera) => /back|rear|environment|arrière|arriere/i.test(camera.label))
  return labeled || cameras[cameras.length - 1]
}

export async function waitForScanRegion(regionId: string, timeoutMs = 3000) {
  const started = Date.now()
  let element: HTMLElement | null = null
  while (Date.now() - started < timeoutMs) {
    element = document.getElementById(regionId)
    if (element && element.clientHeight > 0) return element
    if (element && Date.now() - started > 250) return element
    await new Promise((resolve) => {
      window.requestAnimationFrame(() => resolve(undefined))
    })
  }
  if (element) return element
  throw new Error("scan area not ready")
}

export function scannerConfig(): Html5QrcodeCameraConfig {
  return { fps: 10 }
}

export async function startHtml5Scanner(
  createScanner: () => Html5QrcodeLike,
  getCameras: () => Promise<CameraDeviceLike[]>,
  onScan: (text: string) => void,
  lastScan: { text: string; at: number },
): Promise<Html5QrcodeLike> {
  const config = scannerConfig()
  const onSuccess = (decodedText: string) => {
    const now = Date.now()
    if (decodedText === lastScan.text && now - lastScan.at < SCAN_COOLDOWN_MS) return
    lastScan.text = decodedText
    lastScan.at = now
    onScan(decodedText)
  }
  const onError = () => undefined

  const startWith = async (target: string | { facingMode: "environment" | "user" }) => {
    const scanner = createScanner()
    try {
      await scanner.start(target, config, onSuccess, onError)
      return scanner
    } catch (error) {
      await stopHtml5Scanner(scanner)
      throw error
    }
  }

  const cameras = await getCameras().catch(() => [] as CameraDeviceLike[])
  const camera = pickBackCamera(cameras)
  if (!camera) {
    return startWith({ facingMode: "environment" })
  }

  try {
    return await startWith(camera.id)
  } catch (cameraIdError) {
    try {
      return await startWith({ facingMode: "environment" })
    } catch (facingError) {
      throw new Error(`${cameraErrorDetail(cameraIdError)} | fallback: ${cameraErrorDetail(facingError)}`)
    }
  }
}

export async function stopHtml5Scanner(
  scanner: Html5QrcodeLike | null,
  options?: { clear?: boolean },
) {
  if (!scanner) return
  try {
    await scanner.stop()
  } catch {
    // html5-qrcode lève une string synchrone si le scan n’a jamais démarré.
  }
  if (options?.clear === false) return
  try {
    scanner.clear()
  } catch {
    // L’élément peut déjà être démonté.
  }
}
