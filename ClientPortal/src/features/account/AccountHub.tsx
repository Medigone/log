import { NavLink } from "react-router-dom"
import { Banknote, ChevronRight, ClipboardList, LifeBuoy, LogOut, PackageCheck, UserRound } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { CustomerAvatar, usePortalLogout } from "@/layouts/NavUser"
import type { PortalContext } from "@/shared/types"

const ACCOUNT_LINKS = [
  { to: "/account?tab=profile", label: "Mon compte", description: "Coordonnées et préférences", icon: UserRound },
  { to: "/orders", label: "Mes commandes", description: "Historique et suivi", icon: ClipboardList },
  { to: "/deliveries", label: "Bons de livraison", description: "Documents de livraison", icon: PackageCheck },
  { to: "/payments", label: "Paiements", description: "Règlements et historique", icon: Banknote },
] as const

export function AccountHub({ context }: { context: PortalContext }) {
  const logout = usePortalLogout()
  const displayName = context.customer.customerName || context.user.fullName
  const userName = context.user.fullName || context.user.email

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <CustomerAvatar name={displayName} image={context.customer.image} className="size-12" />
          <div className="grid min-w-0 flex-1 gap-0.5">
            <p className="truncate font-semibold">{displayName}</p>
            <p className="truncate text-sm text-muted-foreground">{userName}</p>
            <p className="text-xs text-muted-foreground">Portail client</p>
          </div>
        </CardContent>
      </Card>

      <ItemGroup className="gap-0 overflow-hidden rounded-xl border">
        {ACCOUNT_LINKS.map((item) => {
          const Icon = item.icon
          return (
            <Item
              key={item.to}
              render={<NavLink to={item.to} />}
              className="min-h-11 rounded-none border-b last:border-b-0"
            >
              <ItemMedia variant="icon">
                <Icon aria-hidden />
              </ItemMedia>
              <ItemContent>
                <ItemTitle>{item.label}</ItemTitle>
                <ItemDescription>{item.description}</ItemDescription>
              </ItemContent>
              <ItemActions>
                <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
              </ItemActions>
            </Item>
          )
        })}
      </ItemGroup>

      <section className="flex flex-col gap-2">
        <h2 className="px-1 text-sm font-medium text-muted-foreground">Assistance</h2>
        <Item variant="outline" className="min-h-11">
          <ItemMedia variant="icon">
            <LifeBuoy aria-hidden />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>Assistance</ItemTitle>
            <ItemDescription>
              {context.company
                ? `Votre équipe ${context.company} reste disponible pour vos commandes et livraisons.`
                : "Votre équipe reste disponible pour vos commandes et livraisons."}
            </ItemDescription>
          </ItemContent>
        </Item>
      </section>

      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-3 text-sm text-destructive outline-none hover:bg-destructive/5 focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => void logout()}
      >
        <LogOut className="size-4" aria-hidden />
        Déconnexion
      </button>
    </div>
  )
}
