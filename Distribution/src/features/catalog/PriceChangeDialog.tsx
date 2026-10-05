import { useState } from "react";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { marginOf, priceChangeAlerts, type PendingPriceChange } from "@/features/catalog/catalogShared";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/shared/format";

/** Confirmation d’un changement de prix saisi dans la grille. */
export function PriceChangeDialog({
  change,
  priceList,
  isBuying,
  onCancel,
  onConfirm,
}: {
  change: PendingPriceChange;
  priceList: string;
  isBuying: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const { row, rate } = change;
  const alerts = priceChangeAlerts(change, isBuying);
  const variation = row.rate != null && row.rate > 0 ? ((rate - row.rate) / row.rate) * 100 : null;
  const before = isBuying ? null : marginOf(row.rate, row.buying_rate);
  const after = isBuying ? null : marginOf(rate, row.buying_rate);

  const confirm = async () => {
    setPending(true);
    try {
      await onConfirm();
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <p className="t-micro text-muted-foreground">Confirmation requise</p>
          <DialogTitle>{row.rate == null ? "Créer le prix" : "Modifier le prix"}</DialogTitle>
          <DialogDescription>
            {row.item_name} · {row.item_code} — liste « {priceList} »
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-3">
          <div className="flex items-center justify-center gap-4 rounded-lg border bg-muted/40 py-3">
            <span className="num text-[15px] text-muted-foreground line-through decoration-1">
              {row.rate == null ? "Aucun prix" : formatMoney(row.rate, { precise: true })}
            </span>
            <ArrowRight className="size-4 text-muted-foreground" />
            <span className="num text-[18px] font-semibold">{formatMoney(rate, { precise: true })}</span>
            {variation != null ? (
              <span className={cn("num text-[12.5px] font-medium", variation >= 0 ? "text-emerald-700" : "text-red-700")}>
                {variation > 0 ? "+" : ""}
                {variation.toFixed(1)} %
              </span>
            ) : null}
          </div>
          {after ? (
            <p className="num text-center text-[12.5px] text-muted-foreground">
              Marge {before ? `${before.rate.toFixed(1)} % → ` : ""}
              <span className={cn("font-medium", after.amount < 0 ? "text-red-700" : "text-foreground")}>{after.rate.toFixed(1)} %</span>
            </p>
          ) : null}
          {alerts.length ? (
            <ul className="space-y-1 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900" data-testid="price-change-alerts">
              {alerts.map((alert) => (
                <li key={alert} className="flex gap-1.5">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {alert}
                </li>
              ))}
            </ul>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Annuler
          </Button>
          <Button onClick={() => void confirm()} disabled={pending} autoFocus>
            {pending ? <Spinner /> : null}
            Confirmer le prix
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
