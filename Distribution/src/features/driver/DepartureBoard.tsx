import { useState } from "react";
import { Check, Package, Play, ScanLine, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

export function DepartureBoard({
  route,
  verified,
  highlightedNote,
  saving,
  onToggle,
  onAcknowledge,
  onRequestLoad,
  onRequestStart,
}: {
  route: DistributionRoute;
  verified: string[];
  highlightedNote?: string;
  saving: boolean;
  onToggle: (deliveryNote: string) => void;
  onAcknowledge: () => void;
  onRequestLoad: () => void;
  onRequestStart: () => void;
}) {
  const loaded = route.stock.status === "Chargé";
  const allVerified = allStopsVerified(route, verified);
  const remaining = route.stops.filter((stop) => !verified.includes(stop.deliveryNote)).length;
  const [preview, setPreview] = useState<RouteStop>();

  return (
    <div className="space-y-4">
      {!route.acknowledged ? (
        <Card density="touch" className="p-4">
          <p className="t-micro text-brand-700">Étape 0 · Révision</p>
          <h2 className="mt-1 t-section">Accepter la tournée</h2>
          <p className="mt-1 t-body text-muted-foreground">
            Contrôlez la révision {route.publishedRevision} avant de vérifier les bons.
          </p>
          <Button size="touch" onClick={onAcknowledge} disabled={saving} className="mt-4 w-full">
            <Check />
            Accepter la révision {route.publishedRevision}
          </Button>
        </Card>
      ) : loaded ? (
        <Card density="touch" className="p-4">
          <p className="t-micro text-brand-700">Étape 3 · Départ</p>
          <h2 className="mt-1 t-section">Démarrer la tournée</h2>
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
        </Card>
      ) : (
        <Card density="touch" className="p-4">
          <p className="t-micro text-brand-700">{allVerified ? "Étape 2 · Chargement" : "Étape 1 · Vérification"}</p>
          <h2 className="mt-1 t-section">{allVerified ? "Charger le véhicule" : "Vérifier les bons"}</h2>
          <p className="mt-1 t-body text-muted-foreground">
            {allVerified
              ? `${route.stops.length} bons contrôlés · ${route.totalQuantity} articles → ${route.vehicleLabel || "véhicule"}`
              : `Cochez ou scannez chaque BL. ${remaining} restant${remaining > 1 ? "s" : ""}.`}
          </p>
          {allVerified ? (
            <Button size="touch" onClick={onRequestLoad} disabled={saving} className="mt-4 w-full">
              <Truck />
              Charger le véhicule
            </Button>
          ) : (
            <p className="mt-3 flex items-center gap-2 t-meta text-muted-foreground">
              <ScanLine className="size-4" />
              Scannez un BL pour avancer automatiquement.
            </p>
          )}
        </Card>
      )}

      <Card density="touch" className="p-4">
        <h2 className="t-section">Bons de la tournée</h2>
        <ul className="mt-3 space-y-2">
          {route.stops.map((stop, index) => {
            const checked = verified.includes(stop.deliveryNote) || loaded;
            const highlighted = highlightedNote === stop.deliveryNote;
            return (
              <li
                key={stop.deliveryNote}
                className={`flex items-stretch gap-1 rounded-xl border p-1 ${
                  highlighted ? "border-brand-600 bg-brand-50" : "border-hairline bg-white"
                }`}
              >
                <button
                  type="button"
                  disabled={!route.acknowledged || loaded}
                  onClick={() => onToggle(stop.deliveryNote)}
                  aria-pressed={checked}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-lg p-2 text-left transition-colors disabled:opacity-70"
                >
                  <span
                    className={`grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                      checked ? "bg-emerald-600 text-white" : "bg-surface-subtle text-slate-600"
                    }`}
                  >
                    {checked ? <Check className="size-4" /> : index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{stop.customerName}</span>
                    <span className="num block t-meta text-muted-foreground">
                      {stop.deliveryNote} · {stop.totalQuantity} art.
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreview(stop)}
                  aria-label={`Voir les articles de ${stop.deliveryNote}`}
                  className={`grid size-11 shrink-0 place-items-center rounded-xl transition-colors ${
                    checked ? "text-emerald-700 hover:bg-emerald-50" : "text-slate-500 hover:bg-surface-subtle"
                  }`}
                >
                  <Package className="size-4" />
                </button>
              </li>
            );
          })}
        </ul>
      </Card>

      {preview ? <DeliveryNotePreview stop={preview} onClose={() => setPreview(undefined)} /> : null}
    </div>
  );
}
