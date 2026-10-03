import type { StatusTone } from "@/shared/design/statusTone";

export function orderStatusTone(status?: string | null, docstatus = 0): StatusTone {
  if (docstatus === 0) return "warning";
  if (docstatus === 2 || status === "Cancelled") return "neutral";
  if (status === "Completed" || status === "Closed") return "success";
  if (status === "On Hold") return "danger";
  return "info";
}
