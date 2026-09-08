import type { ComponentProps, ReactNode } from "react"
import { MapPin, ShoppingBag } from "lucide-react"
import { BrandLogo } from "@/components/BrandLogo"
import { Card, CardContent } from "@/components/ui/card"
import { FieldDescription } from "@/components/ui/field"
import { cn } from "@/lib/utils"

export function AuthBrandPanel() {
  return (
    <div className="relative hidden flex-col justify-between bg-primary p-8 text-primary-foreground md:flex">
      <div className="flex items-center gap-2.5">
        <BrandLogo className="h-10 w-auto brightness-0 invert" />
        <span className="text-sm font-semibold tracking-tight">Modern Pharma</span>
      </div>
      <div className="flex flex-col gap-6">
        <h2 className="max-w-lg text-3xl font-semibold leading-tight">
          Vos commandes et livraisons, réunies au même endroit.
        </h2>
        <div className="flex flex-col gap-3 text-sm text-primary-foreground/90">
          <p className="flex items-center gap-3">
            <ShoppingBag />
            Commandez avec vos tarifs habituels.
          </p>
          <p className="flex items-center gap-3">
            <MapPin />
            Confirmez votre point de livraison en toute sécurité.
          </p>
        </div>
      </div>
    </div>
  )
}

export function AuthSplitCard({
  children,
  className,
  ...props
}: { children: ReactNode } & ComponentProps<"div">) {
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="overflow-hidden p-0">
        <CardContent className="grid p-0 md:grid-cols-2">
          {children}
          <AuthBrandPanel />
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        Besoin d’accès ? Contactez votre responsable IntraPro.
      </FieldDescription>
    </div>
  )
}
