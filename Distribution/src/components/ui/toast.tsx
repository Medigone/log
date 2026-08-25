// Les appelants importent `toast` directement depuis "sonner".
import { Toaster as Sonner } from "sonner"

/** Notifications transitoires — à monter une fois, à la racine de l'app. */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "!rounded-lg !border !border-hairline !bg-card !text-foreground !shadow-raised !text-sm",
          description: "!text-muted-foreground",
          actionButton: "!bg-brand-600 !text-white",
          cancelButton: "!bg-secondary !text-secondary-foreground",
          error: "!border-red-200 !bg-red-50 !text-red-900",
          success: "!border-emerald-200 !bg-emerald-50 !text-emerald-900",
          warning: "!border-amber-200 !bg-amber-50 !text-amber-900",
        },
      }}
    />
  )
}

