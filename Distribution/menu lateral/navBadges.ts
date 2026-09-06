import { useActivityDashboard } from "@/shared/api/distribution"
import type { NavBadgeKey } from "@/layouts/navItems"

export interface NavBadge {
  count: number
  /** true = la file contient du retard → badge rouge / point rouge en rail replié */
  alert: boolean
}

function localDate() {
  const value = new Date()
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
}

/**
 * Compteurs de file affichés dans la barre latérale.
 * Réutilise l’appel déjà fait par /today (même clé SWR → pas de second fetch).
 * Retourne `undefined` pour une clé non chargée : NE PAS afficher 0, masquer le badge.
 */
export function useNavBadges(): Partial<Record<NavBadgeKey, NavBadge>> {
  const { data } = useActivityDashboard(localDate())
  const dashboard = data?.message
  if (!dashboard) return {}

  const toPick = dashboard.preparation?.toPick ?? 0
  const prepOverdue = dashboard.preparation?.overdue ?? 0
  const shortages = dashboard.preparation?.shortageOrders ?? 0
  const toPlan = dashboard.planning?.unassigned ?? 0
  const planOverdue = dashboard.planning?.overdue ?? 0
  const toLoad = dashboard.fulfillment?.toLoad ?? 0
  const cash = dashboard.payments?.toControl ?? 0
  const discrepancies = dashboard.payments?.discrepancies ?? 0

  const badges: Partial<Record<NavBadgeKey, NavBadge>> = {}
  if (toPick > 0) badges.toPick = { count: toPick, alert: prepOverdue > 0 || shortages > 0 }
  if (toPlan > 0) badges.toPlan = { count: toPlan, alert: planOverdue > 0 }
  if (toLoad > 0) badges.toLoad = { count: toLoad, alert: false }
  if (cash > 0) badges.cashToControl = { count: cash, alert: discrepancies > 0 }
  return badges
}

/** Nombre d’anomalies pour l’encart du bas (même filtre que TodayPage). */
export function useNavAlertCount() {
  const { data } = useActivityDashboard(localDate())
  const alerts = data?.message?.alerts ?? []
  return alerts.filter((alert) => alert.id !== "dispatch-ready" && alert.tone !== "info")
}
