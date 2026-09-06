import {
  AlertTriangle,
  Check,
  Clock3,
  LoaderCircle,
  MapPin,
  Navigation,
  Printer,
  QrCode,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { printRouteLabels } from "@/features/planning/qrPrinting";
import { getStopVisualStyle, type StopVisualState } from "@/features/planning/stopStatus";
import { formatMoney, formatShortDate } from "@/shared/format";
import { cn } from "@/lib/utils";
import type { DistributionRoute, RouteStop } from "@/shared/types/distribution";

function StopStatusIcon({ state }: { state: StopVisualState }) {
  if (state === "delivered") return <Check className="size-3.5" aria-hidden="true" />;
  if (state === "partial") return <AlertTriangle className="size-3.5" aria-hidden="true" />;
  if (state === "failed" || state === "cancelled") return <X className="size-3.5" aria-hidden="true" />;
  if (state === "active") return <Navigation className="size-3.5" aria-hidden="true" />;
  return <Clock3 className="size-3.5" aria-hidden="true" />;
}

function StopQr({
  stop,
  onGenerate,
  generating,
}: {
  stop: RouteStop;
  onGenerate: () => void;
  generating: boolean;
}) {
  if (!stop.qrCode) {
    return (
      <div className="grid size-[84px] place-items-center rounded-md border border-dashed border-amber-300 bg-amber-50 p-1 text-center">
        <div>
          <QrCode className="mx-auto size-5 text-amber-700" />
          <Button size="xs" variant="outline" onClick={onGenerate} disabled={generating} className="mt-1 bg-white px-1.5">
            {generating ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
            Générer
          </Button>
        </div>
      </div>
    );
  }
  return (
    <div className="shrink-0 rounded-md border border-hairline bg-white p-1 text-center">
      <img src={stop.qrCode} alt={`QR du BL ${stop.deliveryNote}`} className="mx-auto size-[84px] object-contain" />
      <p className="num mt-1 t-meta text-muted-foreground">{Math.max(stop.packageCount || 1, 1)} étiquette(s)</p>
    </div>
  );
}

export function RouteStopDetail({
  stop,
  route,
  canResolveAccounting = false,
  accountingBusy = false,
  generatingQr,
  onGenerateQr,
  onRetryInvoice,
}: {
  stop: RouteStop;
  route: DistributionRoute;
  canResolveAccounting?: boolean;
  accountingBusy?: boolean;
  generatingQr: boolean;
  onGenerateQr: () => void;
  onRetryInvoice: () => void;
}) {
  const visual = getStopVisualStyle(stop.status);
  const plannedQuantity = stop.items?.reduce((sum, item) => sum + item.quantity, 0) ?? stop.totalQuantity;
  const deliveredQuantity = stop.items?.reduce((sum, item) => sum + item.deliveredQuantity, 0) ?? 0;
  const address =
    stop.address || [stop.commune, stop.wilaya].filter(Boolean).join(", ") || "Adresse non renseignée";
  const packageCount = Math.max(stop.packageCount || 1, 1);
  const blAmount = stop.amountCollected + stop.amountToCollect;
  const accountingEntry = stop.payments.find((payment) => payment.paymentEntry)?.paymentEntry || "En attente caisse";
  const hasCoordinates = stop.latitude != null && stop.longitude != null;

  return (
    <Card
      role="article"
      aria-label={`Arrêt ${stop.sequence} · ${visual.label}`}
      data-stop-state={visual.state}
      className="gap-0 overflow-hidden py-0"
    >
      <div className="flex items-start gap-3 border-b border-hairline p-3.5">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="t-section text-foreground">{stop.customerName}</h3>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${visual.badgeClass}`}
            >
              <StopStatusIcon state={visual.state} />
              {stop.status}
            </span>
          </div>
          <p className="num t-meta text-muted-foreground">
            {stop.deliveryNote} · arrêt {stop.sequence}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            <MapPin className="mr-1 inline size-4" />
            {address}
          </p>
          {stop.requiresCustomerGeolocation ? (
            <p className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
              <MapPin className="size-3" />
              GPS client à collecter
            </p>
          ) : null}
        </div>
        <StopQr stop={stop} generating={generatingQr} onGenerate={onGenerateQr} />
      </div>

      <div className="grid grid-cols-2 divide-x divide-hairline border-b border-hairline bg-surface-subtle sm:grid-cols-4">
        <div className="p-3">
          <p className="t-micro text-muted-foreground">Articles</p>
          <p className="num mt-1 text-sm font-semibold">
            {visual.processed ? `${deliveredQuantity}/${plannedQuantity}` : plannedQuantity}
            <span className="t-meta ml-1 font-medium text-muted-foreground">· {packageCount} paquet(s)</span>
          </p>
        </div>
        <div className="p-3">
          <p className="t-micro text-muted-foreground">Montant BL</p>
          <p className="num mt-1 text-sm font-semibold">{formatMoney(blAmount)}</p>
        </div>
        <div className="p-3">
          <p className="t-micro text-muted-foreground">Encaissé</p>
          <p
            className={cn(
              "num mt-1 text-sm font-semibold",
              stop.amountCollected ? "text-emerald-800" : "text-muted-foreground",
            )}
          >
            {formatMoney(stop.amountCollected)}
          </p>
        </div>
        <div className="p-3">
          <p className="t-micro text-muted-foreground">Restant</p>
          <p
            className={cn(
              "num mt-1 text-sm font-semibold",
              stop.amountToCollect > 0 ? "text-red-700" : "text-emerald-800",
            )}
          >
            {formatMoney(stop.amountToCollect)}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3 border-b border-hairline p-3.5">
        <div className="overflow-hidden rounded-md border border-hairline">
          <table className="w-full border-separate border-spacing-0" aria-label={`Articles du BL ${stop.deliveryNote}`}>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="t-micro border-b border-hairline bg-surface-subtle px-3 py-2 text-left text-muted-foreground"
                >
                  Article
                </th>
                <th
                  scope="col"
                  className="t-micro w-20 border-b border-hairline bg-surface-subtle px-3 py-2 text-right text-muted-foreground"
                >
                  Prévu
                </th>
                <th
                  scope="col"
                  className="t-micro w-20 border-b border-hairline bg-surface-subtle px-3 py-2 text-right text-muted-foreground"
                >
                  Livré
                </th>
                <th
                  scope="col"
                  className="t-micro w-20 border-b border-hairline bg-surface-subtle px-3 py-2 text-right text-muted-foreground"
                >
                  Restant
                </th>
              </tr>
            </thead>
            <tbody>
              {stop.items?.map((item) => (
                <tr key={item.name}>
                  <td className="truncate border-b border-hairline px-3 py-2 text-sm">
                    <strong className="font-medium">{item.itemCode}</strong>
                    <span className="ml-1 text-muted-foreground">{item.itemName}</span>
                  </td>
                  <td className="num border-b border-hairline px-3 py-2 text-right text-sm">{item.quantity}</td>
                  <td className="num border-b border-hairline px-3 py-2 text-right text-sm">{item.deliveredQuantity}</td>
                  <td
                    className={cn(
                      "num border-b border-hairline px-3 py-2 text-right text-sm font-semibold",
                      item.remainingQuantity > 0 ? "text-amber-800" : "text-emerald-800",
                    )}
                  >
                    {item.remainingQuantity}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {stop.payments.length > 0 ? (
          <div className="overflow-hidden rounded-md border border-hairline">
            <div className="divide-y divide-hairline">
              {stop.payments.map((payment) => (
                <div
                  key={payment.name}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm"
                >
                  <span className="inline-flex items-center gap-2 font-medium text-slate-700">
                    <span className="grid size-7 place-items-center rounded-full bg-emerald-100 text-emerald-700">
                      <Check className="size-4" />
                    </span>
                    {payment.method}
                    {payment.chequeNumber ? ` · ${payment.chequeNumber}` : ""}
                  </span>
                  <span className="text-right">
                    <strong className="num font-semibold text-emerald-800">{formatMoney(payment.amount)}</strong>
                    <span className="ml-2 t-meta text-subtle">
                      {payment.status}
                      {payment.paymentEntry ? ` · ${payment.paymentEntry}` : ""}
                    </span>
                    <span className="num block t-meta text-subtle">
                      {payment.collectionDate
                        ? `encaissement ${formatShortDate(payment.collectionDate)}`
                        : formatShortDate(payment.date)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="t-meta text-muted-foreground">Aucun paiement saisi pour cet arrêt.</p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 px-3.5 py-3">
        <p>
          <span className="block t-micro text-muted-foreground">Facture</span>
          <strong className="font-medium">{stop.salesInvoice || "Non créée"}</strong>
          <span
            className={`ml-1.5 t-meta ${stop.invoiceStatus === "Erreur" ? "text-red-700" : "text-muted-foreground"}`}
          >
            {stop.invoiceStatus}
          </span>
          {canResolveAccounting && stop.invoiceStatus === "Erreur" ? (
            <Button size="sm" variant="outline" disabled={accountingBusy} onClick={onRetryInvoice} className="ml-2">
              <RefreshCw className={accountingBusy ? "animate-spin" : ""} />
              Relancer
            </Button>
          ) : null}
        </p>
        <p>
          <span className="block t-micro text-muted-foreground">Paiement comptable</span>
          <strong className="font-medium">{accountingEntry}</strong>
        </p>
        <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => printRouteLabels(route, [stop])}>
            <Printer />
            Imprimer le QR
          </Button>
          {hasCoordinates ? (
            <Button
              size="sm"
              nativeButton={false}
              render={
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${stop.latitude},${stop.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                />
              }
            >
              <Navigation />
              Ouvrir la navigation
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
