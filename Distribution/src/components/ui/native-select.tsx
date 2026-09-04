import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "@/lib/utils"

/** `size` remplace l'attribut natif (nombre de lignes visibles), inutilisé ici. */
interface NativeSelectProps extends Omit<React.ComponentProps<"select">, "size"> {
  size?: "sm" | "default" | "touch"
}

/**
 * `<select>` natif aligné sur le style de `Input`.
 *
 * Volontairement natif plutôt qu'un menu personnalisé : le sélecteur système
 * reste le plus fiable au clavier, avec un lecteur d'écran, et donne la roulette
 * iOS/Android dans l'app livreur.
 */
const NativeSelect = React.forwardRef<HTMLSelectElement, NativeSelectProps>(
  ({ className, size = "default", children, ...props }, ref) => (
    <div className="relative w-full">
      <select
        ref={ref}
        data-slot="native-select"
        className={cn(
          "w-full appearance-none rounded-md border border-input bg-white pl-3 pr-9 text-foreground shadow-card outline-none transition-colors",
          "hover:border-hairline-strong focus-visible:border-brand-600 focus-visible:ring-[3px] focus-visible:ring-ring/25",
          "disabled:cursor-not-allowed disabled:bg-surface-subtle disabled:opacity-60",
          size === "sm" && "h-8 text-xs",
          size === "default" && "h-9 text-sm",
          size === "touch" && "h-14 rounded-touch text-base",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400",
          size === "touch" ? "size-5" : "size-4",
        )}
      />
    </div>
  ),
)
NativeSelect.displayName = "NativeSelect"

function NativeSelectOption({ className, ...props }: React.ComponentProps<"option">) {
  return <option data-slot="native-select-option" className={className} {...props} />
}

export { NativeSelect, NativeSelectOption }
