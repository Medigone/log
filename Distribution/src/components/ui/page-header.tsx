import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface PageHeaderProps {
  /** Surtitre de marque, en micro-capitales. */
  eyebrow?: ReactNode
  title: ReactNode
  /** Badges et compléments rendus À CÔTÉ du titre — jamais dedans, pour que le
   *  nom accessible du `<h1>` reste le seul nom de la page. */
  meta?: ReactNode
  description?: ReactNode
  /** Boutons d'action, alignés à droite sur écran large. */
  actions?: ReactNode
  /** Fil d'Ariane ou bouton retour, rendu au-dessus du surtitre. */
  breadcrumb?: ReactNode
  className?: string
}

/** En-tête de page unique — remplace les 6 en-têtes dupliqués à la main. */
export function PageHeader({ eyebrow, title, meta, description, actions, breadcrumb, className }: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-3 border-b border-hairline pb-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6", className)}>
      <div className="min-w-0">
        {breadcrumb && <div className="mb-2">{breadcrumb}</div>}
        {eyebrow && <p className="t-micro text-brand-700">{eyebrow}</p>}
        <div className={cn("flex flex-wrap items-center gap-3", eyebrow && "mt-1")}>
          <h1 className="t-display text-foreground">{title}</h1>
          {meta}
        </div>
        {description && <p className="mt-1 t-body max-w-2xl text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}
