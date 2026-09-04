import type { PlanningStatus, RouteLifecycle, DistributionRoute } from "@/shared/types/distribution"

export const PLANNING_STATUSES: PlanningStatus[] = [
  "Non planifié",
  "Planifié",
  "Publié",
  "En retard",
  "À revalider",
  "À repréparer",
  "En cours",
  "Terminé",
  "Exception",
]

export const LOCKED_STATUSES = ["En cours", "Terminé", "Exception"]

export function canReprogramAssignment(status?: string) {
  return !LOCKED_STATUSES.includes(status || "")
}

export const ROUTE_LIFECYCLES: RouteLifecycle[] = [
  "Brouillon",
  "Publiée",
  "En cours",
  "Retour dépôt",
  "Contrôle caisse",
  "Terminée",
  "Annulée",
]

export type DateScope = "all" | "today" | "tomorrow" | "overdue"

export function isoDateWithOffset(days = 0) {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  date.setDate(date.getDate() + days)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

export function timePart(value?: string) {
  return value?.match(/(?:T|\s)(\d{2}:\d{2})/)?.[1] || ""
}

export function dateKey(value?: string) {
  return value?.slice(0, 10) || ""
}

export function matchesDateRange(value: string | undefined, from: string, to: string) {
  const date = dateKey(value)
  if (!date) return false
  if (from && date < from) return false
  if (to && date > to) return false
  return true
}

/** Date BL (`requestedDate`) and date livraison (`plannedDate`) are independent. */
export function matchesIndependentDateFilters(
  requestedDate: string | undefined,
  plannedDate: string | undefined,
  blFrom: string,
  blTo: string,
  deliveryFrom: string,
  deliveryTo: string,
) {
  if ((blFrom || blTo) && !matchesDateRange(requestedDate, blFrom, blTo)) return false
  if ((deliveryFrom || deliveryTo) && !matchesDateRange(plannedDate, deliveryFrom, deliveryTo)) return false
  return true
}

export function matchesSearch(query: string, values: Array<string | undefined | null>) {
  if (!query) return true
  return values.some((value) => String(value || "").toLocaleLowerCase("fr").includes(query))
}

const SLOT_BLOCKING_LIFECYCLES = new Set<RouteLifecycle>(["Brouillon", "Publiée", "En cours"])

function parsePlanningDateTime(value?: string | null) {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
  if (!match) return null
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]), 0)
}

function formatPlanningDateTime(value: Date) {
  const pad = (part: number) => String(part).padStart(2, "0")
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}T${pad(value.getHours())}:${pad(value.getMinutes())}:00`
}

export function nextFreeSlot(
  date: string,
  routes: Array<Pick<DistributionRoute, "date" | "lifecycle" | "driver" | "vehicle" | "plannedStart" | "plannedEnd">>,
  driverId: string,
  vehicleId?: string,
  preferredStart = `${date}T08:00:00`,
  preferredEnd = `${date}T12:00:00`,
) {
  const preferred = {
    start: parsePlanningDateTime(preferredStart),
    end: parsePlanningDateTime(preferredEnd),
  }
  if (!preferred.start || !preferred.end || preferred.end <= preferred.start) {
    return { plannedStart: preferredStart, plannedEnd: preferredEnd }
  }
  const durationMs = preferred.end.getTime() - preferred.start.getTime()
  const occupied = routes
    .filter(
      (route) =>
        route.date === date &&
        SLOT_BLOCKING_LIFECYCLES.has(route.lifecycle) &&
        (route.driver === driverId || (vehicleId && route.vehicle === vehicleId)),
    )
    .map((route) => ({
      start: parsePlanningDateTime(route.plannedStart),
      end: parsePlanningDateTime(route.plannedEnd),
    }))
    .filter((slot): slot is { start: Date; end: Date } => Boolean(slot.start && slot.end))
    .sort((left, right) => left.start.getTime() - right.start.getTime())

  let candidateStart = preferred.start
  for (let attempt = 0; attempt < 48; attempt += 1) {
    const candidateEnd = new Date(candidateStart.getTime() + durationMs)
    const conflict = occupied.find((slot) => candidateStart < slot.end && candidateEnd > slot.start)
    if (!conflict) {
      return { plannedStart: formatPlanningDateTime(candidateStart), plannedEnd: formatPlanningDateTime(candidateEnd) }
    }
    const nextStart = conflict.end.getTime() <= candidateStart.getTime()
      ? new Date(candidateStart.getTime() + 60_000)
      : conflict.end
    candidateStart = nextStart
  }
  return {
    plannedStart: formatPlanningDateTime(candidateStart),
    plannedEnd: formatPlanningDateTime(new Date(candidateStart.getTime() + durationMs)),
  }
}
