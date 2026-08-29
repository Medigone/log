import { Badge } from "@/components/ui/badge"
import { documentStatusTone, formatDocumentStatus } from "@/shared/format"

export function StatusBadge({ status }: { status?: string | null }) {
  const label = formatDocumentStatus(status)
  const variant = documentStatusTone(status)
  return (
    <Badge variant={variant} data-tone={variant}>
      {label}
    </Badge>
  )
}
