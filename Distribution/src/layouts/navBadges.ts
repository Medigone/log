import { useActivityDashboard } from "@/shared/api/distribution"
import { useOrderCounts, type OrderCounts } from "@/shared/api/orders"
import { useReceiptCounts, type ReceiptCounts } from "@/shared/api/receipts"
import { useInventories, type Inventory } from "@/shared/api/inventory"
import type { NavBadgeKey } from "@/layouts/navItems"
import type { ActivityAlert, ActivityDashboardData, DistributionRole } from "@/shared/types/distribution"

export interface NavBadge {
  count: number
  /** true = la file contient du retard → badge rouge / point rouge en rail replié */
  alert: boolean
}

function localDate() {
  const value = new Date()
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
}

export function navBadgesFromDashboard(
  dashboard: ActivityDashboardData | undefined,
): Partial<Record<NavBadgeKey, NavBadge>> {
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

export function operationalNavAlerts(alerts: ActivityAlert[] = []) {
  return alerts.filter((alert) => alert.id !== "dispatch-ready" && alert.tone !== "info")
}

/**
 * Compteurs de file affichés dans la barre latérale.
 * Réutilise l’appel déjà fait par /today (même clé SWR → pas de second fetch).
 * Retourne `undefined` pour une clé non chargée : NE PAS afficher 0, masquer le badge.
 */
export function useNavBadges(): Partial<Record<NavBadgeKey, NavBadge>> {
  const { data } = useActivityDashboard(localDate())
  return navBadgesFromDashboard(data?.message)
}

/** Anomalies pour l’encart du bas (même filtre que TodayPage). */
export function useNavAlertCount() {
  const { data } = useActivityDashboard(localDate())
  return operationalNavAlerts(data?.message?.alerts)
}

/** Réceptions : le responsable voit celles à valider, le magasinier celles encore en saisie. */
export function receiptNavBadge(
  role: DistributionRole,
  counts: ReceiptCounts | undefined,
): Partial<Record<NavBadgeKey, NavBadge>> {
  if (!counts) return {}
  const count = role === "magasinier" ? counts.en_cours : role === "responsable" ? counts.a_valider : 0
  return count > 0 ? { receiptsToValidate: { count, alert: false } } : {}
}

export function useReceiptNavBadge(role: DistributionRole) {
  const { data } = useReceiptCounts(role === "magasinier" || role === "responsable")
  return receiptNavBadge(role, data?.message)
}

/** Commandes : le responsable voit les brouillons à valider. */
export function orderNavBadge(
  role: DistributionRole,
  counts: OrderCounts | undefined,
): Partial<Record<NavBadgeKey, NavBadge>> {
  if (role !== "responsable" || !counts?.brouillons) return {}
  return { ordersToValidate: { count: counts.brouillons, alert: false } }
}

export function useOrderNavBadge(role: DistributionRole) {
  const { data } = useOrderCounts(role === "responsable")
  return orderNavBadge(role, data?.message)
}

/** Inventaires : le responsable voit ceux à valider, les compteurs ceux dont le comptage est ouvert. */
export function inventoryNavBadge(
  role: DistributionRole,
  inventories: Inventory[] | undefined,
): Partial<Record<NavBadgeKey, NavBadge>> {
  if (!inventories) return {}
  const status = role === "responsable" ? "En revue" : "En cours"
  const count = inventories.filter((inventory) => inventory.status === status).length
  return count > 0 ? { inventories: { count, alert: false } } : {}
}

export function useInventoryNavBadge(role: DistributionRole) {
  const enabled = role === "responsable" || role === "magasinier" || role === "preparateur"
  const { data } = useInventories(null, enabled)
  return inventoryNavBadge(role, data?.message)
}
