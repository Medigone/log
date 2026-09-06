import { useState } from "react";
import { Check, Package, Play, ScanLine, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { allStopsVerified } from "@/features/driver/departureWorkflow";
import { formatMoney, formatQuantity } from "@/shared/format";
import type { DistributionRoute, RouteStop } from "@/shared/types/distribution";
import { cn } from "@/lib/utils";

function noteQuantity(stop: RouteStop) {
  const fromItems = (stop.items || []).reduce((sum, item) => sum + item.quantity, 0);
  return fromItems || stop.totalQuantity;
}

function noteGrandTotal(stop: RouteStop) {
  if (stop.grandTotal != null) return stop.grandTotal;
  return stop.amountToCollect + stop.amountCollected;
}

export function taxLabel(description: string) {
  return /vat/i.test(description) ? "TVA" : description;
}

export function DeliveryNotePreview({ stop, onClose }: { stop: RouteStop; onClose: () => void }) {
  const items = stop.items || [];
  const taxes = stop.taxes || [];
  const quantity = noteQuantity(stop);
  const grandTotal = noteGrandTotal(stop);
  const showTaxBreakdown = stop.netTotal != null && (taxes.length > 0 || stop.netTotal !== grandTotal);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <p className="t-micro text-brand-700">Bon de livraison</p>
          <DialogTitle>{stop.customerName}</DialogTitle>
          <DialogDescription>
            {stop.deliveryNote}
            {stop.address ? ` · ${stop.address}` : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="p-0">
          {items.length ? (
            <ul className="divide-y divide-hairline">
              {items.map((item) => (
                <li key={item.name} className="flex items-start justify-between gap-3 px-5 py-3">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{item.itemName || item.itemCode}</span>
                    {item.itemCode && item.itemName ? (
                      <span className="num t-meta text-muted-foreground">{item.itemCode}</span>
                    ) : null}
                  </span>
                  <span className="num shrink-0 text-right text-sm font-semibold">
                    {formatQuantity(item.quantity)}
                    {item.amount != null ? (
                      <span className="mt-0.5 block t-meta font-normal text-muted-foreground">
                        {formatMoney(item.amount)}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-5 py-4 t-body text-muted-foreground">Aucun détail d’article sur ce bon.</p>
          )}
          <div className="space-y-2 border-t border-hairline bg-surface-subtle px-5 py-3">
            <p className="t-meta text-muted-foreground">
              {formatQuantity(quantity)} article{quantity > 1 ? "s" : ""}
            </p>
            {showTaxBreakdown ? (
              <>
                <div className="flex items-center justify-between text-sm">
                  <span>Sous-total</span>
                  <span className="num">{formatMoney(stop.netTotal || 0)}</span>
                </div>
                {taxes.map((tax) => (
                  <div key={`${tax.description}-${tax.taxAmount}`} className="flex items-center justify-between text-sm">
                    <span>{taxLabel(tax.description)}</span>
                    <span className="num">{formatMoney(tax.taxAmount)}</span>
                  </div>
                ))}
              </>
            ) : null}
            <div className="flex items-center justify-between border-t border-hairline pt-2 text-sm font-semibold">
              <span>Total</span>
              <strong className="num">{formatMoney(grandTotal)}</strong>
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={onClose} className="w-full sm:w-auto">
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function departureStep(route: DistributionRoute, verified: string[]): 1 | 2 | 3 {
  if (route.stock.status === "Chargé") return 3;
  if (allStopsVerified(route, verified)) return 2;
  return 1;
}

export function DepartureBoard({
  route,
  verified,
  highlightedNote,
  saving,
  onToggle,
  onAcknowledge,
  onRequestLoad,
  onRequestStart,
  onScan,
}: {
  route: DistributionRoute;
  verified: string[];
  highlightedNote?: string;
  saving: boolean;
  onToggle: (deliveryNote: string) => void;
  onAcknowledge: () => void;
  onRequestLoad: () => void;
  onRequestStart: () => void;
  onScan?: () => void;
}) {
  const loaded = route.stock.status === "Chargé";
  const allVerified = allStopsVerified(route, verified);
  const remainingStops = route.stops.filter((stop) => !verified.includes(stop.deliveryNote) && !loaded);
  const checkedStops = route.stops.filter((stop) => verified.includes(stop.deliveryNote) || loaded);
  const remaining = remainingStops.length;
  const checkedCount = checkedStops.length;
  const totalNotes = route.stops.length;
  const verifiedQty = checkedStops.reduce((sum, stop) => sum + noteQuantity(stop), 0);
  const totalQty = route.stops.reduce((sum, stop) => sum + noteQuantity(stop), 0);
  const [preview, setPreview] = useState<RouteStop>();
  const canCheck = route.acknowledged && !loaded;

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      {!route.acknowledged ? (
        <div className="shrink-0 border-b px-4 py-4">
          <h2 className="t-section">Accepter la tournée</h2>
          <p className="mt-1 t-body text-muted-foreground">
            Contrôlez la révision {route.publishedRevision} avant de vérifier les bons.
          </p>
          <Button size="touch" onClick={onAcknowledge} disabled={saving} className="mt-4 w-full">
            <Check />
            Accepter la révision {route.publishedRevision}
          </Button>
        </div>
      ) : loaded ? (
        <div className="shrink-0 border-b px-4 py-4">
          <h2 className="t-section">Démarrer la tournée</h2>
          <p className="mt-1 t-body text-muted-foreground">
            Marchandise dans {route.vehicleLabel || "le véhicule"}. Après le départ, vous pourrez livrer et
            encaisser.
          </p>
          <Button
            size="touch"
            onClick={onRequestStart}
            disabled={saving}
            className="mt-4 w-full bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800"
          >
            <Play />
            Démarrer la tournée
          </Button>
        </div>
      ) : (
        <div className="shrink-0 space-y-3 border-b px-4 py-4">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="num text-[30px] leading-none font-medium tracking-tight">
                {checkedCount}
                <span className="text-[22px] text-muted-foreground"> / {totalNotes}</span>
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                bons contrôlés · {remaining} restant{remaining > 1 ? "s" : ""}
              </p>
            </div>
            <div className="text-right">
              <p className="num text-[15px] font-medium">
                {verifiedQty} / {totalQty}
              </p>
              <p className="text-xs text-muted-foreground">articles</p>
            </div>
          </div>
          <div className="flex gap-0.5" aria-hidden="true">
            <span className="h-1.5 rounded-sm bg-emerald-500" style={{ flex: Math.max(checkedCount, 0.001) }} />
            <span className="h-1.5 rounded-sm bg-border" style={{ flex: Math.max(remaining, 0.001) }} />
          </div>
          {onScan ? (
            <Button size="touch" onClick={onScan} className="w-full">
              <ScanLine />
              Scanner un BL
            </Button>
          ) : null}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {remainingStops.length ? (
          <>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="t-micro tracking-[0.09em] text-muted-foreground uppercase">Restants d’abord</p>
              <p className="text-xs text-muted-foreground">Cocher manuellement</p>
            </div>
            <ul className="space-y-1.5">
              {remainingStops.map((stop) => {
                const index = route.stops.findIndex((item) => item.deliveryNote === stop.deliveryNote);
                const highlighted = highlightedNote === stop.deliveryNote;
                return (
                  <li
                    key={stop.deliveryNote}
                    className={cn(
                      "flex items-center gap-2.5 rounded-xl border p-2.5",
                      highlighted ? "border-amber-600 bg-amber-50" : "border-border bg-background",
                    )}
                  >
                    <button
                      type="button"
                      disabled={!canCheck}
                      onClick={() => onToggle(stop.deliveryNote)}
                      aria-pressed={false}
                      aria-label={stop.customerName}
                      className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
                    >
                      <span
                        className={cn(
                          "num grid size-8 shrink-0 place-items-center rounded-full text-xs font-medium",
                          highlighted
                            ? "border-[1.5px] border-dashed border-amber-600 text-amber-800"
                            : "bg-muted text-muted-foreground",
                        )}
                      >
                        {index + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{stop.customerName}</span>
                        <span
                          className={cn(
                            "num block text-xs",
                            highlighted ? "text-amber-800" : "text-muted-foreground",
                          )}
                        >
                          {stop.deliveryNote} · {noteQuantity(stop)} art.
                        </span>
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreview(stop)}
                      aria-label={`Voir les articles de ${stop.deliveryNote}`}
                      className={cn(
                        "grid size-9 shrink-0 place-items-center rounded-lg",
                        highlighted ? "border border-amber-200 bg-background text-amber-800" : "text-muted-foreground",
                      )}
                    >
                      <Package className="size-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        ) : null}

        {checkedStops.length ? (
          <>
            <div className="mt-3.5 mb-2 flex items-center gap-2">
              <span className="h-px flex-1 bg-border" />
              <p className="t-micro tracking-[0.09em] text-muted-foreground uppercase">
                {checkedCount} contrôlé{checkedCount > 1 ? "s" : ""}
              </p>
              <span className="h-px flex-1 bg-border" />
            </div>
            <ul className="space-y-1">
              {checkedStops.map((stop) => (
                <li key={stop.deliveryNote}>
                  <button
                    type="button"
                    disabled={!canCheck}
                    onClick={() => onToggle(stop.deliveryNote)}
                    aria-pressed={true}
                    aria-label={stop.customerName}
                    className="flex w-full items-center gap-2.5 rounded-[10px] border border-transparent bg-background px-3 py-1.5 text-left"
                  >
                    <span className="grid size-[1.625rem] shrink-0 place-items-center rounded-full bg-emerald-500 text-white">
                      <Check className="size-3.5" strokeWidth={2.5} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[13.5px]">{stop.customerName}</span>
                    <span className="num shrink-0 text-xs text-muted-foreground">{stop.deliveryNote}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>

      {!loaded && route.acknowledged ? (
        <div className="shrink-0 border-t bg-background px-4 pt-3 pb-3">
          <Button
            size="touch"
            onClick={onRequestLoad}
            disabled={saving || !allVerified}
            variant={allVerified ? "default" : "outline"}
            className={cn("w-full", !allVerified && "border-border bg-muted text-muted-foreground")}
          >
            <Truck />
            Charger le véhicule
          </Button>
          <p className="mt-1.5 text-center text-xs text-muted-foreground">
            {allVerified
              ? `${totalNotes} bons contrôlés · ${totalQty} articles → ${route.vehicleLabel || "véhicule"}`
              : remaining === 1
                ? "Débloqué après le dernier bon"
                : `Débloqué après les ${remaining} derniers bons`}
          </p>
        </div>
      ) : null}

      {preview ? <DeliveryNotePreview stop={preview} onClose={() => setPreview(undefined)} /> : null}
    </div>
  );
}
