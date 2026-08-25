import { cn } from "@/lib/utils"
import { formatMoney } from "@/shared/format"

interface MoneyProps {
  value: number
  /** Conserve les centimes — contrôle de caisse. */
  precise?: boolean
  /** Colore les valeurs négatives en rouge (soldes livreurs). */
  signed?: boolean
  className?: string
}

/** Montant en dinars, en chiffres tabulaires pour que les colonnes s'alignent. */
export function Money({ value, precise, signed, className }: MoneyProps) {
  return (
    <span className={cn("num", signed && value < 0 && "text-red-700", className)}>
      {formatMoney(value, { precise })}
    </span>
  )
}
