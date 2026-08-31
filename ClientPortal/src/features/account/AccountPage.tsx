import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react"
import { NavLink, useSearchParams } from "react-router-dom"
import { LocateFixed, MapPin, MapPinned, Save } from "lucide-react"
import { toast } from "sonner"
import { AccountHub } from "@/features/account/AccountHub"
import { CommunePicker } from "@/features/account/CommunePicker"
import { NotificationPreferencesCard } from "@/features/account/NotificationPreferencesCard"
import { StoreLocationMap } from "@/features/account/StoreLocationMap"
import { DetailBackButton } from "@/components/DetailBackButton"
import { ErrorState } from "@/components/LoadState"
import { PageTitle } from "@/components/PageTitle"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { StatusBadge } from "@/components/StatusBadge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { CustomerAvatar } from "@/layouts/NavUser"
import { apiErrorMessage, useCommunes, useCustomerImageActions, useGpsActions, useProfileActions, type GpsSource } from "@/shared/api"
import { formatDate } from "@/shared/format"
import { assertAccurateGps, locate } from "@/shared/geolocation"
import { useIsMobile } from "@/hooks/use-mobile"
import type { PortalContext } from "@/shared/types"

const ACCOUNT_TABS = ["profile", "localisation", "notifications"] as const
type AccountTab = (typeof ACCOUNT_TABS)[number]
type CaptureMode = GpsSource

function readAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ""))
    reader.onerror = () => reject(reader.error || new Error("Lecture de la photo impossible."))
    reader.readAsDataURL(file)
  })
}

function ProfileTab({
  context,
  onUpdated,
}: {
  context: PortalContext
  onUpdated?: () => Promise<unknown> | unknown
}) {
  const { data, isLoading, error } = useCommunes()
  const actions = useProfileActions()
  const imageActions = useCustomerImageActions()
  const communes = data?.message?.items || []
  const [fullName, setFullName] = useState(context.user.fullName)
  const [email, setEmail] = useState(context.customer.email || "")
  const [phone, setPhone] = useState(context.customer.phone || "")
  const [commune, setCommune] = useState(context.customer.commune || "")
  const [wilaya, setWilaya] = useState(context.customer.wilayaName || context.customer.wilaya || "")
  const [requestError, setRequestError] = useState("")
  const [photoError, setPhotoError] = useState("")

  useEffect(() => {
    setFullName(context.user.fullName)
    setEmail(context.customer.email || "")
    setPhone(context.customer.phone || "")
    setCommune(context.customer.commune || "")
    setWilaya(context.customer.wilayaName || context.customer.wilaya || "")
  }, [context])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setRequestError("")
    if (!fullName.trim()) {
      setRequestError("Le nom affiché est obligatoire.")
      return
    }
    if (!commune) {
      setRequestError("Sélectionnez une commune.")
      return
    }
    try {
      await actions.update({
        fullName: fullName.trim(),
        email: email.trim(),
        phone: phone.trim(),
        commune,
      })
      toast.success("Profil mis à jour")
      await onUpdated?.()
    } catch (saveError) {
      setRequestError(apiErrorMessage(saveError))
    }
  }

  const handlePhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ""
    setPhotoError("")
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setPhotoError("Choisissez une image (JPEG, PNG, WebP ou GIF).")
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setPhotoError("La photo dépasse 2 Mo.")
      return
    }
    try {
      await imageActions.update({ imageData: await readAsDataUrl(file), filename: file.name })
      toast.success("Photo du client mise à jour")
      await onUpdated?.()
    } catch (saveError) {
      setPhotoError(apiErrorMessage(saveError))
    }
  }

  return (
    <Card>
      <form onSubmit={submit}>
        <CardHeader className="flex flex-row items-center gap-4">
          <CustomerAvatar name={context.customer.customerName} image={context.customer.image} />
          <div className="grid min-w-0 flex-1 gap-1">
            <CardTitle>{context.customer.customerName}</CardTitle>
            <CardDescription>{context.user.fullName}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <FieldGroup className="grid gap-4 md:grid-cols-2">
            <Field className="md:col-span-2">
              <FieldLabel htmlFor="customer-photo">Photo du client</FieldLabel>
              <Input
                id="customer-photo"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={(event) => void handlePhoto(event)}
                disabled={imageActions.saving}
              />
              <FieldDescription>Cette photo est enregistrée sur la fiche client, pas sur le contact.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="customer-code">Code client</FieldLabel>
              <Input id="customer-code" value={context.customer.name} disabled readOnly />
              <FieldDescription>Ce code est géré par IntraPro et ne peut pas être modifié.</FieldDescription>
            </Field>
            <Field>
              <FieldLabel htmlFor="customer-full-name">Utilisateur</FieldLabel>
              <Input id="customer-full-name" value={fullName} onChange={(event) => setFullName(event.target.value)} required />
            </Field>
            <Field>
              <FieldLabel htmlFor="customer-email">E-mail client</FieldLabel>
              <Input id="customer-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="customer-phone">Téléphone</FieldLabel>
              <Input id="customer-phone" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
            </Field>
            <Field>
              <FieldLabel htmlFor="customer-commune">Commune</FieldLabel>
              {error && <ErrorState error={error} />}
              {isLoading && <Skeleton className="h-8 rounded-lg" />}
              {!isLoading && <CommunePicker value={commune} communes={communes} onChange={(next) => {
                setCommune(next.name)
                setWilaya(next.wilayaName || next.wilaya)
              }} />}
            </Field>
            <Field>
              <FieldLabel htmlFor="customer-wilaya">Wilaya</FieldLabel>
              <Input id="customer-wilaya" value={wilaya} readOnly disabled placeholder="Sélectionnez une commune" />
              <FieldDescription>Renseignée automatiquement à partir de la commune.</FieldDescription>
            </Field>
            <div className="flex items-center justify-between gap-3 rounded-lg border p-4 md:col-span-2">
              <div className="flex items-center gap-3">
                <MapPin className="text-primary" />
                <div>
                  <p className="text-xs text-muted-foreground">Géolocalisation</p>
                  <StatusBadge status={context.gpsConfigured ? "Configurée" : "À confirmer"} />
                </div>
              </div>
              <Button variant="ghost" size="sm" render={<NavLink to="/account?tab=localisation" />} nativeButton={false}>
                Mettre à jour
              </Button>
            </div>
          </FieldGroup>
          {requestError && (
            <Alert variant="destructive" className="mt-4">
              <AlertTitle>Enregistrement impossible</AlertTitle>
              <AlertDescription>{requestError}</AlertDescription>
            </Alert>
          )}
          {photoError && (
            <Alert variant="destructive" className="mt-4">
              <AlertTitle>Photo non enregistrée</AlertTitle>
              <AlertDescription>{photoError}</AlertDescription>
            </Alert>
          )}
        </CardContent>
        <CardFooter>
          <Button type="submit" disabled={actions.saving}>
            {actions.saving ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
            Enregistrer le profil
          </Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function accuracyLabel(accuracy?: number | null) {
  if (accuracy == null) return "—"
  if (accuracy <= 0) return "Position sur carte"
  return `${Math.round(accuracy)} m`
}

function LocationTab({
  context,
  onUpdated,
}: {
  context: PortalContext
  onUpdated?: () => Promise<unknown> | unknown
}) {
  const gps = useGpsActions()
  const savedPin = useMemo<[number, number] | null>(() => {
    if (context.gpsLatitude == null || context.gpsLongitude == null) return null
    return [context.gpsLatitude, context.gpsLongitude]
  }, [context.gpsLatitude, context.gpsLongitude])
  const [mode, setMode] = useState<CaptureMode>("device")
  const [pin, setPin] = useState<[number, number] | null>(savedPin)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    setPin(savedPin)
  }, [savedPin])

  const save = async (source: CaptureMode, latitude: number, longitude: number, accuracy?: number) => {
    setError("")
    try {
      await gps.update({
        source,
        latitude,
        longitude,
        ...(accuracy != null ? { accuracy } : {}),
      })
      toast.success("Position du magasin enregistrée")
      await onUpdated?.()
    } catch (requestError) {
      setError(apiErrorMessage(requestError))
    }
  }

  const captureDevice = async () => {
    setError("")
    setLocating(true)
    try {
      const position = assertAccurateGps(await locate())
      await save("device", position.latitude, position.longitude, position.accuracy)
    } catch (gpsError) {
      setError(apiErrorMessage(gpsError))
    } finally {
      setLocating(false)
    }
  }

  const busy = locating || gps.saving

  return (
    <Card>
      <CardHeader>
        <CardTitle>Localisation du magasin</CardTitle>
        <CardDescription>
          Mettez à jour le point de livraison depuis le magasin, ou en plaçant un pin sur la carte.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={context.gpsConfigured ? "Configurée" : "À confirmer"} />
          {context.gpsConfigured && (
            <p className="text-sm text-muted-foreground">
              Précision {accuracyLabel(context.gpsAccuracy)}
              {context.gpsCapturedAt ? ` · ${formatDate(context.gpsCapturedAt)}` : ""}
            </p>
          )}
        </div>
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Localisation impossible</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Field>
          <FieldTitle>Comment localiser le magasin ?</FieldTitle>
          <ToggleGroup
            value={[mode]}
            onValueChange={(next) => {
              const selected = next[0]
              if (selected === "device" || selected === "map") setMode(selected)
            }}
            variant="outline"
            className="flex w-full max-w-xl flex-wrap"
          >
            <ToggleGroupItem value="device" className="flex-1">
              <LocateFixed data-icon="inline-start" />
              Je suis dans mon magasin
            </ToggleGroupItem>
            <ToggleGroupItem value="map" className="flex-1">
              <MapPinned data-icon="inline-start" />
              Localiser sur la carte
            </ToggleGroupItem>
          </ToggleGroup>
          <FieldDescription>
            {mode === "device"
              ? "Utilisez le GPS du téléphone uniquement si vous êtes sur place. Une précision de 50 m maximum est exigée."
              : "Cliquez pour poser le pin (la pointe indique l'emplacement exact), glissez-le pour l'ajuster, puis confirmez. Cette position n'est pas soumise à la règle des 50 m."}
          </FieldDescription>
        </Field>
        {mode === "device" ? (
          <Alert>
            <LocateFixed />
            <AlertTitle>GPS actuel</AlertTitle>
            <AlertDescription>
              Autorisez la localisation précise, puis enregistrez la position mesurée par cet appareil.
            </AlertDescription>
          </Alert>
        ) : (
          <StoreLocationMap pin={pin} onPick={(latitude, longitude) => setPin([latitude, longitude])} />
        )}
      </CardContent>
      <CardFooter>
        {mode === "device" ? (
          <Button onClick={captureDevice} disabled={busy}>
            {busy && <Spinner data-icon="inline-start" />}
            {!busy && <LocateFixed data-icon="inline-start" />}
            Enregistrer ma position actuelle
          </Button>
        ) : (
          <Button onClick={() => pin && save("map", pin[0], pin[1])} disabled={!pin || busy}>
            {gps.saving && <Spinner data-icon="inline-start" />}
            Enregistrer la position de la carte
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}

export function AccountPage({
  context,
  onUpdated,
}: {
  context: PortalContext
  onUpdated?: () => Promise<unknown> | unknown
}) {
  const [params, setParams] = useSearchParams()
  const isMobile = useIsMobile()
  const requested = params.get("tab")
  const tab: AccountTab = ACCOUNT_TABS.includes(requested as AccountTab) ? (requested as AccountTab) : "profile"

  if (isMobile && !requested) {
    return <AccountHub context={context} />
  }

  return (
    <>
      {isMobile ? <DetailBackButton to="/account" label="Retour au compte" /> : null}
      <PageTitle title="Mon compte" description="Coordonnées, localisation et préférences de notification." />
      <Tabs
        value={tab}
        onValueChange={(value) => {
          const next = new URLSearchParams(params)
          if (value === "profile" && !isMobile) next.delete("tab")
          else next.set("tab", String(value))
          setParams(next, { replace: true })
        }}
      >
        <TabsList variant="line">
          <TabsTrigger value="profile">Profil</TabsTrigger>
          <TabsTrigger value="localisation">Localisation</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>
        <TabsContent value="profile">
          <ProfileTab context={context} onUpdated={onUpdated} />
        </TabsContent>
        <TabsContent value="localisation">
          <LocationTab context={context} onUpdated={onUpdated} />
        </TabsContent>
        <TabsContent value="notifications">
          <NotificationPreferencesCard />
        </TabsContent>
      </Tabs>
    </>
  )
}
