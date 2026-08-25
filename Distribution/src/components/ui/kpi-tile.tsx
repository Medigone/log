import type { ComponentType, ReactNode } from "react"
import { cn } from "@/lib/utils"
import { TONES, type StatusTone } from "@/shared/design/statusTone"

interface KpiTileProps {
  label: ReactNode
  value: ReactNode
  hint?: ReactNode
  icon?: ComponentType<{ className?: string }>
  /** Colore la pastille d'icône et la valeur. `neutral` par défaut. */
  tone?: StatusTone
  /** Rend la tuile cliquable (filtre, navigation). */
  onClick?: () => void
  className?: string
}

/** Tuile de chiffre-clé — remplace le pattern `<article className="rounded-2xl…">` répété. */
export function KpiTile({ label, value, hint, icon: Icon, tone = "neutral", onClick, className }: KpiTileProps) {
  const style = TONES[tone]
  const Wrapper = onClick ? "button" : "div"

  return (
    <Wrapper
      {...(onClick ? { type: "button" as const, onClick } : {})}
      className={cn(
        "rounded-lg border border-hairline bg-card p-3.5 text-left shadow-card",
        onClick && "transition-colors hover:border-brand-300 hover:bg-brand-50/50",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="t-micro text-muted-foreground">{label}</p>
        {Icon && (
          <span className={cn("grid size-7 shrink-0 place-items-center rounded-md", tone === "neutral" ? "bg-surface-subtle text-slate-500" : style.solid)}>
            <Icon className="size-3.5" />
          </span>
        )}
      </div>
      <p className={cn("num mt-2 text-2xl font-semibold tracking-tight", tone === "neutral" ? "text-foreground" : style.text)}>{value}</p>
      {hint && <p className="mt-0.5 t-meta text-muted-foreground">{hint}</p>}
    </Wrapper>
  )
}
