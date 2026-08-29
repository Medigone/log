import { useEffect, useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { Minus, Plus, Save, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { DetailBackButton } from "@/components/DetailBackButton"
import { ErrorState, EmptyState } from "@/components/LoadState"
import { PageTitle } from "@/components/PageTitle"
import { RecordList } from "@/components/RecordList"
import { StatusBadge } from "@/components/StatusBadge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { OrderOriginIcon } from "@/features/orders/OrderOriginIcon"
import { apiErrorMessage, useOrder, useOrderActions } from "@/shared/api"
import { formatDate, formatMoney, todayIso } from "@/shared/format"
import { useListBackPath } from "@/shared/listNavigation"
import type { OrderLine, OrderSummary } from "@/shared/types"

function showFulfillment(order: OrderSummary) {
  return order.docstatus > 0
}

function orderHasPendingEdits(order: OrderSummary, lines: OrderLine[], deliveryDate: string) {
  if (deliveryDate !== order.deliveryDate) return true
  const original = order.items || []
  if (lines.length !== original.length) return true
  return lines.some((line, index) => {
    const source = original[index]
    return !source || source.itemCode !== line.itemCode || source.quantity !== line.quantity
  })
}

function lineDelivered(line: OrderLine) {
  return line.deliveredQuantity ?? 0
}

function lineRemaining(line: OrderLine) {
  return line.remainingQuantity ?? Math.max(line.quantity - lineDelivered(line), 0)
}

function DeliveryProgress({ delivered, total }: { delivered: number; total: number }) {
  const percent = total > 0 ? Math.min(100, Math.round((delivered / total) * 100)) : 0
  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Quantité livrée</span>
        <strong>
          {delivered} / {total}
        </strong>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label="Quantité livrée"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={delivered}
      >
        <div
          className="h-full rounded-full"
          style={{ width: `${percent}%`, backgroundColor: "#2a9d8f" }}
        />
      </div>
    </div>
  )
}

function LineQuantity({ line, order }: { line: OrderLine; order: OrderSummary }) {
  if (!showFulfillment(order)) {
    return <span className="font-medium">{line.quantity}</span>
  }
  const delivered = lineDelivered(line)
  const remaining = lineRemaining(line)
  return (
    <div className="flex flex-col items-end gap-1 text-sm">
      <span className="text-muted-foreground">Commandé {line.quantity}</span>
      <span className="font-medium">Livré {delivered}</span>
      {remaining > 0 ? (
        <Badge variant="warning">Reste {remaining}</Badge>
      ) : (
        <Badge variant="success">Livré intégralement</Badge>
      )}
    </div>
  )
}

export function OrderDetailPage() {
  const { orderId } = useParams()
  const navigate = useNavigate()
  const backTo = useListBackPath("/orders")
  const { data, isLoading, error, mutate } = useOrder(orderId)
  const order = data?.message
  const actions = useOrderActions()
  const [lines, setLines] = useState<OrderLine[]>([])
  const [deliveryDate, setDeliveryDate] = useState("")
  const [requestError, setRequestError] = useState("")

  useEffect(() => {
    if (order) {
      setLines(order.items || [])
      setDeliveryDate(order.deliveryDate)
    }
  }, [order])

  const changeQuantity = (itemCode: string, quantity: number) =>
    setLines((current) =>
      current
        .map((line) => (line.itemCode === itemCode ? { ...line, quantity: Math.max(0, quantity) } : line))
        .filter((line) => line.quantity > 0),
    )

  const save = async () => {
    if (!order) return
    setRequestError("")
    try {
      await actions.update({
        orderId: order.name,
        expectedModified: order.modified,
        deliveryDate,
        items: lines.map(({ itemCode, quantity }) => ({ itemCode, quantity })),
      })
      await mutate()
      toast.success("Commande mise à jour et tarifs recalculés")
    } catch (saveError) {
      setRequestError(apiErrorMessage(saveError))
    }
  }

  const remove = async () => {
    if (!order) return
    setRequestError("")
    try {
      await actions.remove({ orderId: order.name, expectedModified: order.modified })
      toast.success(`Commande ${order.name} annulée`)
      navigate(backTo)
    } catch (removeError) {
      setRequestError(apiErrorMessage(removeError))
    }
  }

  if (isLoading) {
    return (
      <>
        <DetailBackButton to={backTo} label="Retour aux commandes" />
        <Skeleton className="h-96 rounded-xl" />
      </>
    )
  }
  if (error || !order) {
    return (
      <>
        <DetailBackButton to={backTo} label="Retour aux commandes" />
        <ErrorState error={error || new Error("Commande introuvable.")} />
      </>
    )
  }

  const deliveredQuantity = order.deliveredQuantity ?? 0
  const remainingQuantity = order.remainingQuantity ?? Math.max(order.totalQuantity - deliveredQuantity, 0)
  const fulfillment = showFulfillment(order)
  const hasChanges = orderHasPendingEdits(order, lines, deliveryDate)
  const deliveryCount = order.deliveries?.length ?? 0
  const articlesCard = (
    <Card className={fulfillment && !order.canEdit ? "gap-0 py-0" : undefined}>
      {!fulfillment ? (
        <CardHeader>
          <CardTitle>Articles</CardTitle>
        </CardHeader>
      ) : null}
      <CardContent className={fulfillment && !order.canEdit ? "p-0" : undefined}>
        {order.canEdit ? (
          <ItemGroup>
            {lines.map((line) => (
              <Item key={line.itemCode} variant="outline">
                <ItemContent>
                  <ItemTitle>{line.itemName}</ItemTitle>
                  <ItemDescription>{line.itemCode}</ItemDescription>
                </ItemContent>
                <ItemActions className="w-full flex-wrap sm:w-auto">
                  <div className="flex items-center gap-2">
                    <Button size="icon-sm" variant="outline" aria-label={`Diminuer ${line.itemName}`} onClick={() => changeQuantity(line.itemCode, line.quantity - 1)}>
                      <Minus />
                    </Button>
                    <Input
                      aria-label={`Quantité ${line.itemName}`}
                      className="w-20 text-center"
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={(event) => changeQuantity(line.itemCode, Number(event.target.value))}
                    />
                    <Button size="icon-sm" variant="outline" aria-label={`Augmenter ${line.itemName}`} onClick={() => changeQuantity(line.itemCode, line.quantity + 1)}>
                      <Plus />
                    </Button>
                  </div>
                  <strong className="min-w-24 text-right">{formatMoney(line.lineTotalTtc, order.currency)}</strong>
                </ItemActions>
              </Item>
            ))}
          </ItemGroup>
        ) : (
          <RecordList
            items={
              <ItemGroup className="p-4">
                {lines.map((line) => (
                  <Item key={line.itemCode} variant="outline">
                    <ItemContent>
                      <ItemTitle>{line.itemName}</ItemTitle>
                      <ItemDescription>{line.itemCode}</ItemDescription>
                    </ItemContent>
                    <ItemActions className="w-full flex-wrap justify-end sm:w-auto">
                      <LineQuantity line={line} order={order} />
                      <strong className="min-w-24 text-right">{formatMoney(line.lineTotalTtc, order.currency)}</strong>
                    </ItemActions>
                  </Item>
                ))}
              </ItemGroup>
            }
            table={
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Article</TableHead>
                    <TableHead className="text-right">Commandé</TableHead>
                    {fulfillment ? <TableHead className="text-right">Livré</TableHead> : null}
                    {fulfillment ? <TableHead className="text-right">Reste</TableHead> : null}
                    <TableHead className="text-right">Total TTC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((line) => (
                    <TableRow key={line.itemCode}>
                      <TableCell>
                        <div className="font-medium">{line.itemName}</div>
                        <div className="text-muted-foreground text-xs">{line.itemCode}</div>
                      </TableCell>
                      <TableCell className="text-right">{line.quantity}</TableCell>
                      {fulfillment ? (
                        <TableCell className="text-right font-medium">{lineDelivered(line)}</TableCell>
                      ) : null}
                      {fulfillment ? (
                        <TableCell className="text-right">
                          {lineRemaining(line) > 0 ? (
                            <Badge variant="warning">{lineRemaining(line)}</Badge>
                          ) : (
                            <Badge variant="success">0</Badge>
                          )}
                        </TableCell>
                      ) : null}
                      <TableCell className="text-right font-medium">{formatMoney(line.lineTotalTtc, order.currency)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            }
          />
        )}
      </CardContent>
    </Card>
  )

  const summaryCard = (
    <Card className="h-fit gap-0 py-0">
      <div className="flex h-10 items-center border-b px-4">
        <CardTitle>Récapitulatif</CardTitle>
      </div>
      <CardContent className="flex flex-col gap-5 py-4">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Total TTC commande</span>
          <strong className="text-xl">{formatMoney(order.totalTtc, order.currency)}</strong>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">{fulfillment ? "Quantité commandée" : "Quantité"}</span>
          <strong>{order.totalQuantity}</strong>
        </div>
        {fulfillment ? (
          <>
            <DeliveryProgress delivered={deliveredQuantity} total={order.totalQuantity} />
            <div className="flex justify-between">
              <span className="text-muted-foreground">Reste à livrer</span>
              <strong>{remainingQuantity}</strong>
            </div>
            {order.deliveredTotalTtc != null ? (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Montant livré TTC</span>
                <strong>{formatMoney(order.deliveredTotalTtc, order.currency)}</strong>
              </div>
            ) : null}
          </>
        ) : null}
        {order.canEdit && (
          <Field>
            <FieldLabel htmlFor="order-delivery-date">Date de livraison souhaitée</FieldLabel>
            <Input
              id="order-delivery-date"
              type="date"
              min={todayIso()}
              value={deliveryDate}
              onChange={(event) => setDeliveryDate(event.target.value)}
            />
          </Field>
        )}
        {order.canEdit && (
          <div className="grid gap-2">
            {hasChanges ? (
              <Button onClick={save} disabled={actions.saving || !lines.length}>
                {actions.saving ? <Spinner data-icon="inline-start" /> : <Save data-icon="inline-start" />}
                {actions.saving ? "Enregistrement…" : "Enregistrer les modifications"}
              </Button>
            ) : null}
            <Dialog>
              <DialogTrigger render={<Button variant="outline" className="text-destructive" />}>
                <Trash2 data-icon="inline-start" />
                Annuler la commande
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Annuler {order.name} ?</DialogTitle>
                  <DialogDescription>
                    Cette commande sera définitivement retirée. Cette action n&apos;est plus possible une fois la commande validée.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose render={<Button variant="outline" />}>Retour</DialogClose>
                  <Button variant="destructive" onClick={remove} disabled={actions.saving}>
                    {actions.saving && <Spinner data-icon="inline-start" />}
                    Annuler la commande
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        )}
      </CardContent>
    </Card>
  )

  return (
    <>
      <DetailBackButton to={backTo} label="Retour aux commandes" />
      <PageTitle
        title={order.name}
        description={`Créée le ${formatDate(order.transactionDate)} · livraison souhaitée le ${formatDate(order.deliveryDate)}`}
        badge={
          <span className="flex flex-wrap items-center gap-2">
            <OrderOriginIcon source={order.source} showLabel />
            <StatusBadge status={order.status} />
          </span>
        }
      />
      {requestError && (
        <Alert variant="destructive">
          <AlertTitle>Opération impossible</AlertTitle>
          <AlertDescription>{requestError}</AlertDescription>
        </Alert>
      )}
      {fulfillment ? (
        <Tabs defaultValue="articles">
          <TabsList variant="line">
            <TabsTrigger value="articles">Articles</TabsTrigger>
            <TabsTrigger value="deliveries">
              Bons de livraison
              <Badge variant="secondary">{deliveryCount}</Badge>
            </TabsTrigger>
          </TabsList>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
            <TabsContent value="articles" className="min-w-0">
              {articlesCard}
            </TabsContent>
            <TabsContent value="deliveries" className="min-w-0">
              {deliveryCount > 0 ? (
                <div className="grid gap-3">
                  {(order.deliveries ?? []).map((note) => (
                    <Link
                      key={note.name}
                      to={`/deliveries/${note.name}`}
                      aria-label={`Consulter ${note.name}`}
                      className="rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    >
                      <Card size="sm">
                        <CardHeader>
                          <CardTitle>{note.name}</CardTitle>
                          <CardDescription>
                            {formatDate(note.deliveryDate)} · {note.totalQuantity} article(s) remis
                          </CardDescription>
                          <CardAction>
                            <StatusBadge status={note.status} />
                          </CardAction>
                        </CardHeader>
                        <CardFooter className="justify-between">
                          <span className="text-muted-foreground">Total TTC</span>
                          <strong>{formatMoney(note.totalTtc, note.currency)}</strong>
                        </CardFooter>
                      </Card>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Aucun bon de livraison"
                  description="Les bons liés à cette commande apparaîtront ici."
                />
              )}
            </TabsContent>
            {summaryCard}
          </div>
        </Tabs>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          {articlesCard}
          {summaryCard}
        </div>
      )}
    </>
  )
}
