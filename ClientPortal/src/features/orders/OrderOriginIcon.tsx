import { Building2, Globe } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

const ORIGINS = {
  "Portail client": { icon: Globe, label: "Portail client" },
  Interne: { icon: Building2, label: "Interne" },
} as const

export function OrderOriginIcon({
  source,
  showLabel = false,
  className,
}: {
  source?: string | null
  showLabel?: boolean
  className?: string
}) {
  const key = (source || "").trim()
  const meta = key in ORIGINS ? ORIGINS[key as keyof typeof ORIGINS] : null
  if (!meta) return null

  const Icon = meta.icon

  return (
    <Tooltip>
      <TooltipTrigger
        render={<span className={cn("inline-flex items-center gap-1 text-muted-foreground", className)} />}
      >
        <Icon className="size-3.5" strokeWidth={1.25} aria-hidden />
        {showLabel ? <span className="text-sm text-foreground">{meta.label}</span> : null}
        <span className="sr-only">Origine de la commande : {meta.label}</span>
      </TooltipTrigger>
      <TooltipContent>Origine de la commande : {meta.label}</TooltipContent>
    </Tooltip>
  )
}
