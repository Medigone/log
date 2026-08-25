import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

/** Bandeau de filtres : fond inset, grille normalisée, contrôles en h-9. */
export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-lg border border-hairline bg-surface-subtle p-3", className)}>
      <div className="flex flex-wrap items-end gap-3">{children}</div>
    </div>
  )
}

interface ToolbarFieldProps {
  label: ReactNode
  children: ReactNode
  className?: string
}

/** Champ de filtre étiqueté. Largeur pilotée par `className` (ex. `w-44`, `flex-1`). */
export function ToolbarField({ label, children, className }: ToolbarFieldProps) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="t-micro text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

/** Pousse les éléments suivants à droite du bandeau. */
export function ToolbarSpacer() {
  return <div className="ml-auto" />
}
