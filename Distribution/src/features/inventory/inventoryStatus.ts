import type { StatusTone } from "@/shared/design/statusTone"
import type { InventoryLineStatus, InventoryStatus } from "@/shared/api/inventory"

export function inventoryStatusTone(status: InventoryStatus): StatusTone {
  switch (status) {
    case "En cours":
      return "info"
    case "En revue":
    case "En validation":
      return "warning"
    case "Validé":
      return "success"
    case "Annulé":
      return "danger"
    default:
      return "neutral"
  }
}

export function lineStatusTone(status: InventoryLineStatus): StatusTone {
  if (status === "Compté") return "success"
  if (status === "À recompter") return "warning"
  return "neutral"
}

/** Le comptage n'accepte des saisies que tant que l'inventaire est « En cours ». */
export function canCount(status: InventoryStatus) {
  return status === "En cours"
}

export function canReview(status: InventoryStatus) {
  return status === "En cours" || status === "En revue"
}
