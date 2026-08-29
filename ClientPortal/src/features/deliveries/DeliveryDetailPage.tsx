import { useParams } from "react-router-dom"
import { DetailBackButton } from "@/components/DetailBackButton"
import { ErrorState } from "@/components/LoadState"
import { PageTitle } from "@/components/PageTitle"
import { RecordList } from "@/components/RecordList"
import { StatusBadge } from "@/components/StatusBadge"
import { Card, CardContent, CardTitle } from "@/components/ui/card"
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { SalesOrderLinks, salesOrderLabel } from "@/features/deliveries/SalesOrderLinks"
import { useDelivery } from "@/shared/api"
import { formatDate, formatMoney } from "@/shared/format"
import { useListBackPath } from "@/shared/listNavigation"

export function DeliveryDetailPage() {
  const { deliveryId } = useParams()
  const backTo = useListBackPath("/deliveries")
  const { data, isLoading, error } = useDelivery(deliveryId)
  const note = data?.message
  if (isLoading) {
    return (
      <>
        <DetailBackButton to={backTo} label="Retour aux livraisons" />
        <Skeleton className="h-96 rounded-xl" />
      </>
    )
  }
  if (error || !note) {
    return (
      <>
        <DetailBackButton to={backTo} label="Retour aux livraisons" />
        <ErrorState error={error || new Error("Bon introuvable.")} />
      </>
    )
  }

  const orderMeta = salesOrderLabel(note.salesOrders)

  return (
    <>
      <DetailBackButton to={backTo} label="Retour aux livraisons" />
      <PageTitle
        title={note.name}
        description={[`Livraison du ${formatDate(note.deliveryDate)}`, orderMeta].filter(Boolean).join(" · ")}
        action={<StatusBadge status={note.status} />}
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="gap-0 py-0">
          <CardContent className="p-0">
            <RecordList
              items={
                <ItemGroup className="p-4">
                  {note.items?.map((line) => (
                    <Item key={`${line.itemCode}-${line.itemName}`} variant="outline">
                      <ItemContent>
                        <ItemTitle>{line.itemName}</ItemTitle>
                        <ItemDescription>{line.itemCode}</ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <span className="text-sm font-medium">{line.quantity}</span>
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
                      <TableHead>Référence</TableHead>
                      <TableHead className="text-right">Quantité</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {note.items?.map((line) => (
                      <TableRow key={`${line.itemCode}-${line.itemName}`}>
                        <TableCell className="font-medium">{line.itemName}</TableCell>
                        <TableCell>{line.itemCode}</TableCell>
                        <TableCell className="text-right">{line.quantity}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
            />
          </CardContent>
        </Card>
        <Card className="h-fit gap-0 py-0">
          <div className="flex h-10 items-center border-b px-4">
            <CardTitle>Récapitulatif</CardTitle>
          </div>
          <CardContent className="flex flex-col gap-3 py-4">
            <div className="flex items-start justify-between gap-3">
              <span className="text-muted-foreground">{(note.salesOrders?.length ?? 0) > 1 ? "Commandes liées" : "Commande liée"}</span>
              <SalesOrderLinks names={note.salesOrders} className="text-right" />
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total TTC</span>
              <strong>{formatMoney(note.totalTtc, note.currency)}</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Quantité</span>
              <strong>{note.totalQuantity}</strong>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
