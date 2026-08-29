import { useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { LocateFixed, Minus, Plus, ShoppingBag, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { useCart } from "@/cart/CartContext"
import { PageTitle } from "@/components/PageTitle"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Spinner } from "@/components/ui/spinner"
import { apiErrorMessage, useOrderActions } from "@/shared/api"
import { formatMoney, todayIso } from "@/shared/format"
import { assertAccurateGps, locate } from "@/shared/geolocation"
import type { CartLine, GpsPosition, OrderPreview, PortalContext } from "@/shared/types"

export function CartPage({ context }: { context: PortalContext }) {
  const cart = useCart()
  const navigate = useNavigate()
  const actions = useOrderActions()
  const [deliveryDate, setDeliveryDate] = useState(todayIso())
  const [preview, setPreview] = useState<OrderPreview | null>(null)
  const [gps, setGps] = useState<GpsPosition | null>(null)
  const [error, setError] = useState("")
  const signature = useMemo(() => JSON.stringify({ lines: cart.lines.map(({ itemCode, quantity }) => ({ itemCode, quantity })), deliveryDate }), [cart.lines, deliveryDate])
  const [previewSignature, setPreviewSignature] = useState("")

  const payload = {
    items: cart.lines.map(({ itemCode, quantity, campaign, placement }) => ({
      itemCode,
      quantity,
      ...(campaign ? { campaign, placement } : {}),
    })),
    deliveryDate,
  }

  const verify = async () => {
    setError("")
    try {
      const result = await actions.preview(payload)
      setPreview(result)
      setPreviewSignature(signature)
      return result
    } catch (requestError) {
      setError(apiErrorMessage(requestError))
      return null
    }
  }

  const captureGps = async () => {
    setError("")
    try {
      const position = assertAccurateGps(await locate())
      setGps(position)
      toast.success(`Position enregistrée avec une précision de ${Math.round(position.accuracy)} m`)
      return position
    } catch (gpsError) {
      setError(apiErrorMessage(gpsError))
      return null
    }
  }

  const submit = async () => {
    setError("")
    if (!cart.lines.length) return
    if (previewSignature !== signature || !preview) {
      await verify()
      toast.info("Totaux recalculés. Vérifiez-les puis confirmez la commande.")
      return
    }
    let position = gps
    if (!context.gpsConfigured && !position) position = await captureGps()
    if (!context.gpsConfigured && !position) return
    try {
      const order = await actions.create({ ...payload, gps: position || undefined })
      cart.clear()
      toast.success(`Commande ${order.name} créée`)
      navigate(`/orders/${order.name}`)
    } catch (requestError) {
      setError(apiErrorMessage(requestError))
    }
  }

  if (!cart.lines.length) {
    return (
      <>
        <PageTitle title="Panier" />
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <ShoppingBag />
            </EmptyMedia>
            <EmptyTitle>Votre panier est vide</EmptyTitle>
            <EmptyDescription>Ajoutez des articles depuis la boutique.</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={() => navigate("/")}>Parcourir la boutique</Button>
          </EmptyContent>
        </Empty>
      </>
    )
  }

  return (
    <>
      <PageTitle title="Panier" description="Votre commande sera transmise à notre équipe pour validation." />
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Validation impossible</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex flex-col gap-3">
          {cart.lines.map((line) => {
            const previewLine = preview?.items.find((item) => item.itemCode === line.itemCode && !item.isFreeItem)
            const hiddenPrice = line.showPrice === false || line.unitPriceTtc == null
            return (
            <Card key={line.itemCode}>
              <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{line.itemName}</p>
                  <p className="text-xs text-muted-foreground">
                    {line.itemCode}
                    {hiddenPrice
                      ? " · Prix sur demande"
                      : ` · ${formatMoney(previewLine?.unitPriceTtc ?? line.unitPriceTtc ?? 0, line.currency)} / ${line.uom}`}
                  </p>
                  {line.offerLabel && <p className="text-xs text-muted-foreground">{line.offerLabel}</p>}
                  {previewLine && previewLine.discountPercentage ? (
                    <p className="text-xs text-muted-foreground">Remise ligne {previewLine.discountPercentage} %</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button size="icon-sm" variant="outline" aria-label="Diminuer" onClick={() => cart.updateQuantity(line.itemCode, line.quantity - 1)}>
                    <Minus />
                  </Button>
                  <Input
                    aria-label={`Quantité ${line.itemName}`}
                    type="number"
                    min="1"
                    value={line.quantity}
                    onChange={(event) => cart.updateQuantity(line.itemCode, Number(event.target.value))}
                    className="w-20 text-center"
                  />
                  <Button size="icon-sm" variant="outline" aria-label="Augmenter" onClick={() => cart.updateQuantity(line.itemCode, line.quantity + 1)}>
                    <Plus />
                  </Button>
                  <Button size="icon-sm" variant="ghost" aria-label="Supprimer" onClick={() => cart.remove(line.itemCode)}>
                    <Trash2 className="text-destructive" />
                  </Button>
                </div>
              </CardContent>
            </Card>
            )
          })}
        </div>
        <Card className="h-fit lg:sticky lg:top-20">
          <CardHeader>
            <CardTitle>Validation</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-5">
            <Field>
              <FieldLabel htmlFor="delivery-date">Date de livraison souhaitée</FieldLabel>
              <Input
                id="delivery-date"
                type="date"
                min={todayIso()}
                value={deliveryDate}
                onChange={(event) => setDeliveryDate(event.target.value)}
              />
            </Field>
            <div className="flex flex-col gap-3 rounded-lg bg-muted p-4 text-sm">
              <div className="flex justify-between">
                <span>Estimation catalogue</span>
                <strong>{formatMoney(cart.total, cart.lines[0]?.currency)}</strong>
              </div>
              {preview && (
                <>
                  <Separator />
                  {preview.items.filter((item) => item.isFreeItem).map((item) => (
                    <div key={`free-${item.itemCode}`} className="flex justify-between text-muted-foreground">
                      <span>Offert · {item.itemName}</span>
                      <span>{formatMoney(0, preview.currency)}</span>
                    </div>
                  ))}
                  {(preview.discountAmount || 0) > 0 && (
                    <div className="flex justify-between">
                      <span>Remise</span>
                      <strong>-{formatMoney(preview.discountAmount || 0, preview.currency)}</strong>
                    </div>
                  )}
                  {priceChanged(cart.lines, preview) && (
                    <p className="text-xs text-muted-foreground">
                      Les totaux ont été recalculés par ERPNext et peuvent différer du prix affiché en boutique.
                    </p>
                  )}
                  <div className="flex justify-between text-base">
                    <span>Total TTC recalculé</span>
                    <strong>{formatMoney(preview.totalTtc, preview.currency)}</strong>
                  </div>
                </>
              )}
            </div>
            {!context.gpsConfigured && (
              <Alert>
                <LocateFixed />
                <AlertTitle>Géolocalisation requise</AlertTitle>
                <AlertDescription>
                  {gps ? `Position prête (${Math.round(gps.accuracy)} m).` : "Une position précise à 50 m maximum sera enregistrée sur votre fiche client."}
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
          <CardFooter className="grid gap-2">
            <Button variant="outline" className="w-full" onClick={verify} disabled={actions.previewing}>
              {actions.previewing && <Spinner data-icon="inline-start" />}
              Recalculer le total
            </Button>
            <Button className="w-full" onClick={submit} disabled={actions.saving || actions.previewing}>
              {actions.saving && <Spinner data-icon="inline-start" />}
              {actions.saving ? "Création…" : previewSignature === signature ? "Confirmer la commande" : "Vérifier avant de confirmer"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </>
  )
}

function priceChanged(lines: CartLine[], preview: OrderPreview) {
  const previewByCode = new Map(preview.items.filter((item) => !item.isFreeItem).map((item) => [item.itemCode, item.unitPriceTtc]))
  return lines.some((line) => {
    const previewed = previewByCode.get(line.itemCode)
    if (previewed == null || line.unitPriceTtc == null || line.showPrice === false) return false
    return Math.abs(previewed - line.unitPriceTtc) > 0.05
  })
}
