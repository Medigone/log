import { toast } from "sonner"
import { Bell, Smartphone } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/LoadState"
import { Skeleton } from "@/components/ui/skeleton"
import { apiErrorMessage, useNotificationPreferenceActions, useNotificationPreferences } from "@/shared/api"
import { usePortalPwa, type PushStatus } from "@/pwa/usePortalPwa"
import type { NotificationCategory } from "@/shared/types"

const PREFERENCE_FIELDS: Array<{
  key: NotificationCategory
  label: string
  description: string
}> = [
  {
    key: "commandes",
    label: "Commandes",
    description: "Validation, annulation, clôture ou mise en pause de vos commandes.",
  },
  {
    key: "livraisons",
    label: "Livraisons",
    description: "Départ en tournée, livraison effectuée, partielle ou non livrée.",
  },
  {
    key: "paiements",
    label: "Paiements",
    description: "Confirmation lorsqu’un règlement est validé.",
  },
  {
    key: "demandes",
    label: "Demandes hors catalogue",
    description: "Refus ou conversion de vos demandes en commande.",
  },
  {
    key: "promotions",
    label: "Promotions",
    description: "Nouvelles offres publiées pour votre magasin. Désactivé par défaut.",
  },
]

const PUSH_COPY: Record<PushStatus, { title: string; description: string }> = {
  idle: {
    title: "Notifications téléphone",
    description: "Vérification de l’état des notifications sur cet appareil.",
  },
  unsupported: {
    title: "Notifications téléphone indisponibles",
    description: "Ce navigateur ne prend pas en charge les notifications push.",
  },
  "needs-install": {
    title: "Installez l’application",
    description: "Sur iPhone, ajoutez Modern Pharma à l’écran d’accueil puis ouvrez-la pour activer les notifications.",
  },
  denied: {
    title: "Notifications bloquées",
    description: "Autorisez les notifications Modern Pharma dans les réglages du navigateur ou du téléphone.",
  },
  prompt: {
    title: "Activer les notifications téléphone",
    description: "Recevez une alerte même lorsque le portail est fermé.",
  },
  subscribed: {
    title: "Notifications téléphone activées",
    description: "Les commandes, livraisons et autres alertes choisies ci-dessous arriveront sur cet appareil.",
  },
  error: {
    title: "Notifications téléphone",
    description: "Impossible d’activer les notifications sur cet appareil.",
  },
}

export function NotificationPreferencesCard() {
  const { data, isLoading, error, mutate } = useNotificationPreferences()
  const actions = useNotificationPreferenceActions()
  const pwa = usePortalPwa()
  const categories = data?.message?.categories
  const pushCopy = PUSH_COPY[pwa.pushStatus]

  const toggle = async (key: NotificationCategory, enabled: boolean) => {
    if (!categories) return
    try {
      await actions.update({ [key]: enabled ? 1 : 0 })
      await mutate()
      toast.success("Préférences enregistrées")
    } catch (saveError) {
      toast.error(apiErrorMessage(saveError))
    }
  }

  if (error) return <ErrorState error={error} />

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Smartphone className="size-4" aria-hidden />
            {pushCopy.title}
          </CardTitle>
          <CardDescription>{pwa.pushError || pushCopy.description}</CardDescription>
        </CardHeader>
        {pwa.pushStatus === "prompt" || pwa.pushStatus === "error" ? (
          <CardContent>
            <Button type="button" onClick={() => void pwa.enablePush()} disabled={pwa.enablingPush}>
              <Bell data-icon="inline-start" />
              Activer les notifications
            </Button>
          </CardContent>
        ) : null}
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Alertes du portail</CardTitle>
          <CardDescription>
            Choisissez les événements envoyés dans le portail et, une fois l’application installée, sur votre téléphone.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading || !categories ? (
            <div className="flex flex-col gap-3">
              {PREFERENCE_FIELDS.map((field) => (
                <Skeleton key={field.key} className="h-16 rounded-lg" />
              ))}
            </div>
          ) : (
            <FieldGroup>
              {PREFERENCE_FIELDS.map((field) => (
                <Field key={field.key} orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor={`notif-${field.key}`}>{field.label}</FieldLabel>
                    <FieldDescription>{field.description}</FieldDescription>
                  </FieldContent>
                  <Switch
                    id={`notif-${field.key}`}
                    checked={Boolean(categories[field.key])}
                    disabled={actions.saving}
                    onCheckedChange={(checked) => void toggle(field.key, Boolean(checked))}
                  />
                </Field>
              ))}
            </FieldGroup>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
