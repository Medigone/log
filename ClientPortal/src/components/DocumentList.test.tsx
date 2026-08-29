import { MemoryRouter, Route, Routes } from "react-router-dom"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi } from "vitest"
import { DocumentList } from "@/components/DocumentList"

const items = [
  {
    name: "SO-1",
    date: "2026-08-20",
    status: "Draft",
    total: "12 000,00 DZD",
  },
]

function renderList() {
  return render(
    <MemoryRouter initialEntries={["/orders"]}>
      <Routes>
        <Route
          path="/orders"
          element={
            <DocumentList
              items={items}
              getKey={(item) => item.name}
              href={(item) => `/orders/${item.name}`}
              title={(item) => item.name}
              meta={(item) => item.date}
              status={(item) => item.status}
              amount={(item) => item.total}
              columns={[
                { header: "Commande", cell: (item) => item.name },
                { header: "Date", cell: (item) => item.date },
              ]}
            />
          }
        />
        <Route path="/orders/:orderId" element={<div>Détail commande</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe("DocumentList", () => {
  it("affiche des cartes Item sur mobile et une table sur desktop", () => {
    renderList()

    const [card] = screen.getAllByRole("link", { name: "Consulter SO-1" })
    expect(card.closest("[data-slot='item-group']")?.parentElement).toHaveClass("md:hidden")
    expect(card).toHaveAttribute("data-variant", "outline")
    expect(screen.getByText("En attente de validation")).toBeInTheDocument()
    expect(screen.getByRole("table").closest(".hidden")).toHaveClass("hidden", "md:block")
    expect(screen.queryByRole("button", { name: "Consulter SO-1" })).not.toBeInTheDocument()
  })

  it("navigue vers le détail au clic sur la ligne", async () => {
    const user = userEvent.setup()
    renderList()
    const row = document.querySelector("tr[aria-label='Consulter SO-1']")
    expect(row).toBeTruthy()
    await user.click(row as HTMLElement)
    expect(screen.getByText("Détail commande")).toBeVisible()
  })

  it("appelle onSort au clic sur une colonne triable", async () => {
    const user = userEvent.setup()
    const onSort = vi.fn()
    render(
      <MemoryRouter>
        <DocumentList
          items={items}
          getKey={(item) => item.name}
          title={(item) => item.name}
          status={(item) => item.status}
          sort={{ field: "date", dir: "desc" }}
          onSort={onSort}
          columns={[
            { header: "Commande", cell: (item) => item.name },
            { header: "Date", sortKey: "date", cell: (item) => item.date },
            { header: "Statut", cell: (item) => item.status },
          ]}
        />
      </MemoryRouter>,
    )

    expect(screen.getByRole("columnheader", { name: /Date/ })).toHaveAttribute("aria-sort", "descending")
    await user.click(screen.getByRole("button", { name: "Trier par Date" }))
    expect(onSort).toHaveBeenCalledWith("date", "asc")
    expect(screen.queryByRole("button", { name: "Trier par Statut" })).not.toBeInTheDocument()
  })
})
