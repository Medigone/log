import { render, screen } from "@testing-library/react"
import { vi } from "vitest"
import { PaymentsPage } from "@/features/payments/PaymentsPage"
import type { PortalContext } from "@/shared/types"

vi.mock("@/shared/api", async () => {
  const actual = await vi.importActual<typeof import("@/shared/api")>("@/shared/api")
  return {
    ...actual,
    usePayments: () => ({
      data: { message: { items: [], page: 1, pageLength: 20, hasNext: false } },
      isLoading: false,
      error: null,
    }),
    useBalance: () => ({
      data: {
        message: {
          balances: [{ company: "IntraPro", currency: "DZD", amount: 12500 }],
          asOf: "2026-08-28 10:00:00",
        },
      },
      isLoading: false,
      error: null,
    }),
  }
})

const context: PortalContext = {
  user: { name: "client@example.com", fullName: "Client", email: "client@example.com" },
  customer: { name: "CUST-1", customerName: "Client test" },
  company: "IntraPro",
  currency: "DZD",
  gpsConfigured: true,
  mustChangePassword: false,
  balances: [],
}

describe("page Paiements", () => {
  it("affiche le solde en haut de page", () => {
    render(<PaymentsPage context={context} />)
    expect(screen.getByText(/Solde actuel/)).toBeVisible()
    expect(screen.getByText(/Montant comptable à régler/)).toBeVisible()
  })
})
