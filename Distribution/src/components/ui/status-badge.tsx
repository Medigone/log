import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { TONES, type StatusTone } from "@/shared/design/statusTone"

interface StatusBadgeProps {
  tone: StatusTone
  children: ReactNode
  /** Ajoute un point de couleur — le statut se lit avant le libellé. */
  dot?: boolean
  size?: "sm" | "default"
  className?: string
}

/** Pastille de statut unique de l'application, pilotée par `statusTone.ts`. */
export function StatusBadge({ tone, children, dot = true, size = "default", className }: StatusBadgeProps) {
  const style = TONES[tone]
  return (
    <span
      className={cn(
        "inline-flex w-fit shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full font-semibold",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs",
        style.badge,
        className
      )}
    >
      {dot && <span className={cn("size-1.5 shrink-0 rounded-full", style.dot)} aria-hidden="true" />}
      {children}
    </span>
  )
}
