import { beforeEach, describe, expect, it, vi } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ItemBarcodesPage } from "@/features/barcodes/ItemBarcodesPage"
import type { ItemBarcodeItem, ItemBarcodeSummary } from "@/features/barcodes/itemBarcodeScan"

const mocks = vi.hoisted(() => ({
  lookup: vi.fn(),
  add: vi.fn(),
  remove: vi.fn(),
  mutateItem: vi.fn(),
  mutateSearch: vi.fn(),
  toastSuccess: vi.fn(),
}))

const items: ItemBarcodeSummary[] = [
  { itemCode: "ART-1", itemName: "Doliprane", stockUom: "Unité", barcodeCount: 1 },
  { itemCode: "ART-2", itemName: "Ibuprofène", stockUom: "Unité", barcodeCount: 0 },
]

const art1: ItemBarcodeItem = {
  itemCode: "ART-1",
  itemName: "Doliprane",
  stockUom: "Unité",
  barcodes: [{ barcode: "123456", uom: "Unité" }],
  uoms: [
    { uom: "Unité", conversionFactor: 1 },
    { uom: "Carton", conversionFactor: 12 },
  ],
}

const art2: ItemBarcodeItem = {
  itemCode: "ART-2",
  itemName: "Ibuprofène",
  stockUom: "Unité",
  barcodes: [],
  uoms: [{ uom: "Unité", conversionFactor: 1 }],
}

let selected: ItemBarcodeItem | undefined = art1

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: vi.fn() },
}))

vi.mock("@/components/BarcodeScannerDialog", () => ({
  BarcodeScannerDialog: ({ open }: { open: boolean }) => (open ? <div role="dialog">Scanner caméra</div> : null),
}))

vi.mock("@/shared/api/itemBarcodes", () => ({
  apiErrorMessage: (error: unknown) => String(error),
  useItemBarcodeSearch: () => ({
    data: { message: items },
    error: undefined,
    isLoading: false,
    mutate: mocks.mutateSearch,
  }),
  useItemBarcode: (itemCode: string | null) => ({
    data: itemCode && selected?.itemCode === itemCode ? { message: selected } : itemCode ? { message: selected } : undefined,
    error: undefined,
    isLoading: false,
    mutate: mocks.mutateItem,
  }),
  useItemBarcodeMutations: () => ({
    lookupBarcode: mocks.lookup,
    addBarcode: mocks.add,
    removeBarcode: mocks.remove,
    lookingUp: false,
    adding: false,
    removing: false,
  }),
}))

function renderPage() {
  return render(<ItemBarcodesPage />)
}

describe("ItemBarcodesPage", () => {
  beforeEach(() => {
    selected = art1
    mocks.lookup.mockReset()
    mocks.add.mockReset()
    mocks.remove.mockReset()
    mocks.mutateItem.mockReset()
    mocks.mutateSearch.mockReset()
    mocks.toastSuccess.mockReset()
    mocks.lookup.mockResolvedValue({ barcode: "999", item: null })
    mocks.add.mockResolvedValue({ ...art1, barcodes: [...art1.barcodes, { barcode: "999", uom: "Unité" }], already: false })
    mocks.remove.mockResolvedValue({ ...art1, barcodes: [] })
  })

  it("liste les articles et affiche les codes de l’article choisi", async () => {
    const user = userEvent.setup()
    renderPage()
    expect(screen.getByRole("heading", { name: "Codes-barres" })).toBeInTheDocument()
    expect(screen.getByLabelText("Code-barres à associer")).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /ART-1 · Doliprane/i }))
    expect(screen.getByText("123456")).toBeInTheDocument()
    expect(screen.getByRole("combobox", { name: "Unité du code-barres" })).toBeInTheDocument()
  })

  it("associe un nouveau code à l’article sélectionné", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole("button", { name: /ART-1 · Doliprane/i }))
    const scan = screen.getByLabelText("Code-barres à associer")
    await user.type(scan, "999{Enter}")
    await waitFor(() => expect(mocks.lookup).toHaveBeenCalledWith("999"))
    await waitFor(() => expect(mocks.add).toHaveBeenCalledWith("ART-1", "999", "Unité"))
    expect(mocks.toastSuccess).toHaveBeenCalled()
  })

  it("garde un code inconnu en attente si aucun article n’est choisi", async () => {
    const user = userEvent.setup()
    selected = undefined
    renderPage()
    await user.type(screen.getByLabelText("Code-barres à associer"), "888{Enter}")
    await waitFor(() => expect(mocks.lookup).toHaveBeenCalledWith("888"))
    expect(mocks.add).not.toHaveBeenCalled()
    expect(screen.getByText(/888/)).toBeInTheDocument()
    expect(screen.getByText(/en attente d’un article/i)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: "Annuler" }))
    expect(screen.queryByText(/en attente d’un article/i)).not.toBeInTheDocument()
  })

  it("refuse un code déjà lié à un autre article", async () => {
    const user = userEvent.setup()
    mocks.lookup.mockResolvedValue({ barcode: "123456", item: art2 })
    renderPage()
    await user.click(screen.getByRole("button", { name: /ART-1 · Doliprane/i }))
    await user.type(screen.getByLabelText("Code-barres à associer"), "123456{Enter}")
    await waitFor(() => expect(screen.getByText(/déjà associé à ART-2/i)).toBeInTheDocument())
    expect(mocks.add).not.toHaveBeenCalled()
  })

  it("retire un code associé", async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(screen.getByRole("button", { name: /ART-1 · Doliprane/i }))
    await user.click(screen.getByRole("button", { name: "Retirer 123456" }))
    await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("ART-1", "123456"))
  })
})
