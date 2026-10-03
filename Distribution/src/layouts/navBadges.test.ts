import { describe, expect, it } from "vitest"
import { navBadgesFromDashboard, operationalNavAlerts, orderNavBadge, receiptNavBadge } from "@/layouts/navBadges"
import type { ActivityDashboardData } from "@/shared/types/distribution"

function dashboard(partial: Partial<ActivityDashboardData>): ActivityDashboardData {
  return {
    date: "2026-09-05",
    role: "responsable",
    ...partial,
  }
}

describe("navBadges", () => {
  it("masque les compteurs à zéro et tant que le dashboard n’est pas chargé", () => {
    expect(navBadgesFromDashboard(undefined)).toEqual({})
    expect(navBadgesFromDashboard(dashboard({ preparation: { toPick: 0, overdue: 0, today: 0, later: 0, inProgressPickLists: 0, remainingQty: 0, shortageOrders: 0, pickLists: [] } }))).toEqual({})
  })

  it("signale le retard sur préparation et planification", () => {
    const badges = navBadgesFromDashboard(
      dashboard({
        preparation: { toPick: 4, overdue: 1, today: 2, later: 1, inProgressPickLists: 0, remainingQty: 0, shortageOrders: 0, pickLists: [] },
        planning: { unassigned: 5, overdue: 2 },
        fulfillment: { toLoad: 1, loaded: 0, returnsPending: 0, toLoadRoutes: [], returnRoutes: [] },
        payments: { toControl: 3, discrepancies: 1, declaredToday: 0, pendingPayments: 0, driverCashTotal: 0, driverCashBoxes: 0 },
      }),
    )
    expect(badges.toPick).toEqual({ count: 4, alert: true })
    expect(badges.toPlan).toEqual({ count: 5, alert: true })
    expect(badges.toLoad).toEqual({ count: 1, alert: false })
    expect(badges.cashToControl).toEqual({ count: 3, alert: true })
  })

  it("ignore les alertes informatives pour l’encart", () => {
    expect(
      operationalNavAlerts([
        { id: "dispatch-ready", tone: "info", title: "Prêt", detail: "" },
        { id: "note", tone: "info", title: "Info", detail: "" },
        { id: "prep-overdue", tone: "danger", title: "Préparation en retard", detail: "1 commande" },
      ]).map((alert) => alert.id),
    ).toEqual(["prep-overdue"])
  })

  it("affiche les réceptions à valider au responsable et en saisie au magasinier", () => {
    const counts = { en_cours: 2, a_valider: 3, valide_30j: 9 }
    expect(receiptNavBadge("responsable", counts)).toEqual({ receiptsToValidate: { count: 3, alert: false } })
    expect(receiptNavBadge("magasinier", counts)).toEqual({ receiptsToValidate: { count: 2, alert: false } })
    expect(receiptNavBadge("preparateur", counts)).toEqual({})
    expect(receiptNavBadge("responsable", undefined)).toEqual({})
  })

  it("affiche au responsable les commandes à valider", () => {
    const counts = { a_livrer: 2, brouillons: 4, brouillons_portail: 1, soumises_aujourdhui: 2, montant_aujourdhui: 1000 }
    expect(orderNavBadge("responsable", counts)).toEqual({ ordersToValidate: { count: 4, alert: false } })
    expect(orderNavBadge("commercial", counts)).toEqual({})
    expect(orderNavBadge("responsable", { ...counts, brouillons: 0 })).toEqual({})
  })
})
