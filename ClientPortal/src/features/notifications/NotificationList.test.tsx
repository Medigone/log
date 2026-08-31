import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi } from "vitest"
import { NotificationList } from "@/features/notifications/NotificationList"
import type { PortalNotification } from "@/shared/types"

const items: PortalNotification[] = [
  {
    name: "N-1",
    category: "commandes",
    eventType: "order_confirmed",
    title: "Commande validée",
    body: "Votre commande SO-1 a été validée et sera préparée.",
    link: "/orders/SO-1",
    documentType: "Sales Order",
    documentName: "SO-1",
    read: false,
    creation: "2026-08-31 15:00:00",
  },
  {
    name: "N-2",
    category: "livraisons",
    eventType: "delivered",
    title: "Livraison effectuée",
    body: "Le bon DN-1 a été livré.",
    link: "/deliveries/DN-1",
    documentType: "Delivery Note",
    documentName: "DN-1",
    read: true,
    creation: "2026-08-30 10:00:00",
  },
]

describe("liste de notifications", () => {
  it("affiche le titre et distingue les non lues", async () => {
    const onSelect = vi.fn()
    const user = userEvent.setup()
    render(<NotificationList items={items} onSelect={onSelect} />)
    expect(screen.getByText("Commande validée")).toBeVisible()
    expect(screen.getByText("Nouveau")).toBeVisible()
    expect(screen.getByText("Livraison effectuée")).toBeVisible()
    await user.click(screen.getByRole("button", { name: /Commande validée/ }))
    expect(onSelect).toHaveBeenCalledWith(items[0])
  })

  it("affiche un état vide", () => {
    render(<NotificationList items={[]} onSelect={vi.fn()} />)
    expect(screen.getByText("Aucune notification")).toBeVisible()
  })
})
