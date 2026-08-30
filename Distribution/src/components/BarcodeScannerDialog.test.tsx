import { describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { BarcodeScannerDialog } from "@/components/BarcodeScannerDialog"

const start = vi.fn()
const stop = vi.fn().mockResolvedValue(undefined)
const getCameras = vi.fn().mockResolvedValue([])

vi.mock("html5-qrcode", () => ({
  Html5Qrcode: class {
    start = (...args: unknown[]) => start(...args)
    stop = (...args: unknown[]) => stop(...args)
    clear = vi.fn()
    static getCameras = (...args: unknown[]) => getCameras(...args)
  },
}))

describe("BarcodeScannerDialog", () => {
  it("affiche prélevé / reste et propose Réessayer si la caméra échoue", async () => {
    start.mockRejectedValue(new Error("OverconstrainedError"))
    getCameras.mockResolvedValue([])
    const user = userEvent.setup()
    render(
      <BarcodeScannerDialog
        open
        onOpenChange={vi.fn()}
        onScan={vi.fn()}
        scanResult={{ itemName: "Article test", picked: 1, requested: 2, remaining: 1 }}
      />,
    )

    expect(screen.getByRole("dialog", { name: /scanner un code-barres/i })).toBeInTheDocument()
    expect(screen.getByText("Article test")).toBeInTheDocument()
    expect(screen.getByText("1 / 2")).toBeInTheDocument()
    expect(screen.getByText(/reste 1/i)).toBeInTheDocument()

    expect(await screen.findByRole("alert")).toHaveTextContent(/caméra arrière|aucune caméra/i)
    expect(screen.getByText(/overconstrainederror/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /copier l’erreur/i })).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /réessayer/i }))
    await waitFor(() => expect(start.mock.calls.length).toBeGreaterThan(1))
  })
})
