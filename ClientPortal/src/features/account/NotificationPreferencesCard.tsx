import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { ErrorState } from "@/components/LoadState"
import { Skeleton } from "@/components/ui/skeleton"
import { apiErrorMessage, useNotificationPreferenceActions, useNotificationPreferences } from "@/shared/api"
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

export function NotificationPreferencesCard() {
  const { data, isLoading, error, mutate } = useNotificationPreferences()
  const actions = useNotificationPreferenceActions()
  const categories = data?.message?.categories

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
    <Card>
      <CardHeader>
        <CardTitle>Notifications</CardTitle>
        <CardDescription>
          Choisissez les alertes affichées dans le portail. Les notifications e-mail arriveront plus tard.
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
  )
}
