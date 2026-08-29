import { NavLink } from "react-router-dom"
import { ArrowRight, Banknote, MapPinCheck, PackageCheck, ShoppingBag, ShoppingCart } from "lucide-react"
import { PageTitle } from "@/components/PageTitle"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { StatusBadge } from "@/components/StatusBadge"
import { formatMoney } from "@/shared/format"
import type { PortalContext } from "@/shared/types"

export function DashboardPage({ context }: { context: PortalContext }) {
  return (
    <>
      <PageTitle
        title={`Bonjour ${context.user.fullName}`}
        description="Retrouvez votre activité commerciale et passez une nouvelle commande."
        action={
          <Button render={<NavLink to="/store" />} nativeButton={false}>
            <ShoppingBag data-icon="inline-start" />
            Ouvrir le store
          </Button>
        }
      />
      {!context.gpsConfigured && (
        <Alert>
          <MapPinCheck />
          <AlertTitle>Point de livraison à confirmer</AlertTitle>
          <AlertDescription>
            Enregistrez la position de votre magasin depuis{" "}
            <NavLink to="/account?tab=localisation">Mon compte → Localisation</NavLink>
            , ou lors de votre prochaine commande.
          </AlertDescription>
        </Alert>
      )}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {context.balances.map((balance) => (
          <Card key={`${balance.company}-${balance.currency}`}>
            <CardHeader>
              <CardDescription>Solde actuel · {balance.company}</CardDescription>
              <CardTitle>{formatMoney(balance.amount, balance.currency)}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">
                {balance.amount < 0 ? "Crédit disponible" : balance.amount > 0 ? "Montant comptable à régler" : "Compte à jour"}
              </p>
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader>
            <CardDescription>Localisation</CardDescription>
            <CardTitle>
              <StatusBadge status={context.gpsConfigured ? "Configurée" : "À enregistrer"} />
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <p className="text-sm text-muted-foreground">
              {[context.customer.communeName, context.customer.wilayaName || context.customer.wilaya].filter(Boolean).join(" · ") || "Commune non renseignée"}
            </p>
            <Button variant="ghost" render={<NavLink to="/account?tab=localisation" />} nativeButton={false}>
              {context.gpsConfigured ? "Mettre à jour" : "Enregistrer"}
              <ArrowRight data-icon="inline-end" />
            </Button>
          </CardContent>
        </Card>
      </section>
      <section className="grid gap-4 md:grid-cols-3">
        {[
          { to: "/orders", label: "Mes commandes", description: "Consulter ou modifier une commande.", icon: ShoppingCart },
          { to: "/deliveries", label: "Mes livraisons", description: "Suivre les bons de livraison.", icon: PackageCheck },
          { to: "/payments", label: "Mes paiements", description: "Voir les encaissements déclarés.", icon: Banknote },
        ].map((item) => {
          const Icon = item.icon
          return (
            <Card key={item.to} className="transition hover:border-primary/40">
              <CardHeader>
                <Icon className="text-primary" />
                <CardTitle className="text-lg">{item.label}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <Button variant="ghost" render={<NavLink to={item.to} />} nativeButton={false}>
                  Consulter
                  <ArrowRight data-icon="inline-end" />
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </section>
    </>
  )
}
