import { describe, expect, it } from "vitest"
import { navBadgesFromDashboard, operationalNavAlerts } from "@/layouts/navBadges"
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
})
