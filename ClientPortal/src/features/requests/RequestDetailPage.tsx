import { useState } from "react"
import { Link, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { DetailBackButton } from "@/components/DetailBackButton"
import { ErrorState } from "@/components/LoadState"
import { PageTitle } from "@/components/PageTitle"
import { RecordList } from "@/components/RecordList"
import { StatusBadge } from "@/components/StatusBadge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { apiErrorMessage, useCatalogRequest, useCatalogRequestActions } from "@/shared/api"
import { formatDate } from "@/shared/format"
import { useListBackPath } from "@/shared/listNavigation"
import type { CatalogRequestLine } from "@/shared/types"

function LinePhoto({ line }: { line: CatalogRequestLine }) {
  if (!line.photo) return null
  return (
    <img
      src={line.photo}
      alt={`Photo ${line.designation}`}
      className="max-h-16 max-w-16 rounded-md border object-contain"
    />
  )
}

export function RequestDetailPage() {
  const { requestId } = useParams()
  const navigate = useNavigate()
  const backTo = useListBackPath("/requests")
  const { data, isLoading, error, mutate } = useCatalogRequest(requestId)
  const request = data?.message
  const actions = useCatalogRequestActions()
  const [requestError, setRequestError] = useState("")

  const cancel = async () => {
    if (!request) return
    setRequestError("")
    try {
      await actions.cancel({ requestId: request.name })
      toast.success(`Demande ${request.name} annulée`)
      navigate(backTo)
    } catch (cancelError) {
      setRequestError(apiErrorMessage(cancelError))
      await mutate()
    }
  }

  if (isLoading) {
    return (
      <>
        <DetailBackButton to={backTo} label="Retour aux demandes" />
        <Skeleton className="h-96 rounded-xl" />
      </>
    )
  }
  if (error || !request) {
    return (
      <>
        <DetailBackButton to={backTo} label="Retour aux demandes" />
        <ErrorState error={error || new Error("Demande introuvable.")} />
      </>
    )
  }

  const lines = request.items || []

  const articlesCard = (
    <Card className="gap-0 py-0">
      <div className="flex h-10 items-center border-b px-4">
        <CardTitle>Articles</CardTitle>
      </div>
      <CardContent className="p-0">
        <RecordList
          items={
            <ItemGroup className="p-4">
              {lines.map((line) => (
                <Item key={line.name || line.designation} variant="outline">
                  {line.photo ? (
                    <ItemMedia>
                      <LinePhoto line={line} />
                    </ItemMedia>
                  ) : null}
                  <ItemContent>
                    <ItemTitle>{line.designation}</ItemTitle>
                    <ItemDescription>
                      {[
                        `Qté ${line.quantity}`,
                        line.reference,
                        line.notes,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </ItemDescription>
                  </ItemContent>
                </Item>
              ))}
            </ItemGroup>
          }
          table={
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Désignation</TableHead>
                  <TableHead className="text-right">Qté</TableHead>
                  <TableHead>Référence</TableHead>
                  <TableHead>Notes</TableHead>
                  <TableHead>Photo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.name || line.designation}>
                    <TableCell>
                      <div className="font-medium">{line.designation}</div>
                    </TableCell>
                    <TableCell className="text-right">{line.quantity}</TableCell>
                    <TableCell className="text-muted-foreground">{line.reference || "—"}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-pre-wrap">{line.notes || "—"}</TableCell>
                    <TableCell>
                      <LinePhoto line={line} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          }
        />
      </CardContent>
    </Card>
  )

  const summaryCard = (
    <Card className="h-fit gap-0 py-0">
      <div className="flex h-10 items-center border-b px-4">
        <CardTitle>Récapitulatif</CardTitle>
      </div>
      <CardContent className="flex flex-col gap-5 py-4">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Date</span>
          <strong>{formatDate(request.creation)}</strong>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Livraison souhaitée</span>
          <strong>{formatDate(request.deliveryDate)}</strong>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Statut</span>
          <StatusBadge status={request.status} />
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Lignes</span>
          <strong>{request.itemCount}</strong>
        </div>
        {request.orderId ? (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Commande</span>
            <Link className="font-medium underline underline-offset-4" to={`/orders/${request.orderId}`}>
              {request.orderId}
            </Link>
          </div>
        ) : null}
        {request.comment ? (
          <div className="grid gap-1">
            <span className="text-muted-foreground">Commentaire</span>
            <p className="text-sm whitespace-pre-wrap">{request.comment}</p>
          </div>
        ) : null}
        {request.canCancel ? (
          <Dialog>
            <DialogTrigger render={<Button variant="outline" className="text-destructive" />}>
              Annuler la demande
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Annuler {request.name} ?</DialogTitle>
                <DialogDescription>
                  Elle sera supprimée tant qu’elle n’a pas été prise en charge. Cette action n’est plus possible une
                  fois le traitement commencé.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>Retour</DialogClose>
                <Button variant="destructive" onClick={() => void cancel()} disabled={actions.saving}>
                  {actions.saving && <Spinner data-icon="inline-start" />}
                  Annuler la demande
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}
      </CardContent>
    </Card>
  )

  return (
    <>
      <DetailBackButton to={backTo} label="Retour aux demandes" />
      <PageTitle
        title={request.name}
        description={`Créée le ${formatDate(request.creation)} · livraison souhaitée le ${formatDate(request.deliveryDate)}`}
        badge={<StatusBadge status={request.status} />}
      />
      {requestError && (
        <Alert variant="destructive">
          <AlertTitle>Action impossible</AlertTitle>
          <AlertDescription>{requestError}</AlertDescription>
        </Alert>
      )}
      {request.status === "Refusée" && request.refusalReason && (
        <Alert variant="destructive">
          <AlertTitle>Demande refusée</AlertTitle>
          <AlertDescription>{request.refusalReason}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        {articlesCard}
        {summaryCard}
      </div>
    </>
  )
}
