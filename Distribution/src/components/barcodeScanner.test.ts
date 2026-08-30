import { afterEach, describe, expect, it, vi } from "vitest"
import {
  cameraErrorDetail,
  cameraErrorMessage,
  pickBackCamera,
  startHtml5Scanner,
  stopHtml5Scanner,
  waitForScanRegion,
} from "@/components/barcodeScanner"

describe("barcodeScanner", () => {
  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("mappe OverconstrainedError, NotReadableError et la zone absente", () => {
    expect(cameraErrorMessage(new Error("OverconstrainedError"))).toMatch(/caméra arrière/i)
    expect(cameraErrorMessage(new Error("NotReadableError"))).toMatch(/pas encore prête/i)
    expect(cameraErrorMessage("config.qrbox dimensions should not be greater")).toMatch(/zone de scan/i)
    expect(cameraErrorMessage(new Error("scan area not ready"))).toMatch(/zone de scan/i)
    expect(cameraErrorMessage(new Error("HTML Element with id=x not found"))).toMatch(/zone de scan/i)
    expect(cameraErrorDetail("Cannot stop, scanner is not running or paused.")).toBe(
      "Cannot stop, scanner is not running or paused.",
    )
  })

  it("choisit la caméra arrière, sinon la dernière", () => {
    expect(
      pickBackCamera([
        { id: "front", label: "Front Camera" },
        { id: "back", label: "Back Camera" },
      ])?.id,
    ).toBe("back")
    expect(pickBackCamera([{ id: "a", label: "cam 1" }, { id: "b", label: "cam 2" }])?.id).toBe("b")
    expect(pickBackCamera([])).toBeUndefined()
  })

  it("attend que la zone de scan soit dans le DOM", async () => {
    const pending = waitForScanRegion("scan-region", 500)
    window.setTimeout(() => {
      const region = document.createElement("div")
      region.id = "scan-region"
      document.body.appendChild(region)
    }, 20)
    await expect(pending).resolves.toBeInstanceOf(HTMLElement)
  })

  it("démarre avec l’id de la caméra arrière", async () => {
    const start = vi.fn().mockResolvedValue(null)
    await startHtml5Scanner(
      () => ({ start, stop: vi.fn(), clear: vi.fn() }),
      async () => [
        { id: "front", label: "front" },
        { id: "rear", label: "back camera" },
      ],
      vi.fn(),
      { text: "", at: 0 },
    )
    expect(start).toHaveBeenCalledTimes(1)
    expect(start.mock.calls[0][0]).toBe("rear")
  })

  it("utilise facingMode environment si aucune caméra n’est listée", async () => {
    const start = vi.fn().mockResolvedValue(null)
    await startHtml5Scanner(
      () => ({ start, stop: vi.fn(), clear: vi.fn() }),
      async () => [],
      vi.fn(),
      { text: "", at: 0 },
    )
    expect(start.mock.calls[0][0]).toEqual({ facingMode: "environment" })
  })

  it("crée une nouvelle instance si le start par id échoue", async () => {
    const start = vi
      .fn()
      .mockRejectedValueOnce(new Error("OverconstrainedError"))
      .mockResolvedValueOnce(null)
    const stop = vi.fn().mockImplementation(() => {
      throw "Cannot stop, scanner is not running or paused."
    })
    await startHtml5Scanner(
      () => ({ start, stop, clear: vi.fn() }),
      async () => [{ id: "rear", label: "back camera" }],
      vi.fn(),
      { text: "", at: 0 },
    )
    expect(start).toHaveBeenCalledTimes(2)
    expect(start.mock.calls[0][0]).toBe("rear")
    expect(start.mock.calls[1][0]).toEqual({ facingMode: "environment" })
  })

  it("n’échoue pas si stop() lève une string html5-qrcode", async () => {
    const scanner = {
      start: vi.fn(),
      stop: () => {
        throw "Cannot stop, scanner is not running or paused."
      },
      clear: vi.fn(),
    }
    await expect(stopHtml5Scanner(scanner)).resolves.toBeUndefined()
  })
})
