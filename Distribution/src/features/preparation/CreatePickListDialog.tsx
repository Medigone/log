import { useEffect, useRef } from "react";
import { AlertTriangle, ClipboardList } from "lucide-react";
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
import { type SalesOrderRow, type StockShortage } from "@/shared/api/preparation";
import { formatQuantity } from "@/shared/format";

function shortagesOf(order: SalesOrderRow): StockShortage[] {
  return order.stock_shortages || [];
}

function orderHasNothingToPick(order: SalesOrderRow) {
  return order.has_available_stock === false;
}

export function CreatePickListDialog({
  open,
  orders,
  creating,
  onOpenChange,
  onConfirm,
}: {
  open: boolean;
  orders: SalesOrderRow[];
  creating: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const nothingToPick = orders.length > 0 && orders.every(orderHasNothingToPick);
  const partial = !nothingToPick && orders.some((order) => shortagesOf(order).length > 0);

  useEffect(() => {
    if (open) confirmButtonRef.current?.focus();
  }, [open]);

  const title = nothingToPick ? "Stock insuffisant" : partial ? "Prélever le disponible" : "Confirmer la création";
  const description = nothingToPick
    ? "Aucun article n’a de stock disponible. Réapprovisionnez l’entrepôt avant de créer une liste."
    : partial
      ? "La liste ne contiendra que le stock actuel. Le manquant restera sur la commande pour une prochaine liste, une fois le stock réceptionné."
      : `${orders.length} ${orders.length > 1 ? "listes de prélèvement seront créées" : "liste de prélèvement sera créée"}, une par commande sélectionnée.`;
  const footerHint = nothingToPick
    ? "Réceptionnez le stock, puis réessayez."
    : partial
      ? "Les articles en rupture resteront à préparer plus tard, sans modifier la commande."
      : "Les listes seront créées en brouillon et pourront être contrôlées avant la génération des bons de livraison.";
  const confirmLabel = creating ? "Création…" : partial ? "Créer la liste du disponible" : "Confirmer la création";

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !creating && onOpenChange(false)}>
      <DialogContent>
        <DialogHeader>
          <div className="flex items-start gap-3">
            <div
              className={`shrink-0 rounded-md p-2 ${nothingToPick || partial ? "bg-red-50 text-red-700" : "bg-brand-50 text-brand-700"}`}
            >
              {nothingToPick || partial ? <AlertTriangle className="size-5" /> : <ClipboardList className="size-5" />}
            </div>
            <div>
              <DialogTitle>{title}</DialogTitle>
              <DialogDescription className="mt-1">{description}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody>
          <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-hairline bg-surface-subtle p-3">
            {orders.map((order) => {
              const shortages = shortagesOf(order);
              return (
                <div key={order.name} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <strong className="text-foreground">{order.name}</strong>
                    <span className="truncate text-muted-foreground">
                      {order.customer_name || order.customer || "Client non renseigné"}
                    </span>
                  </div>
                  {shortages.map((shortage) => (
                    <p key={`${order.name}-${shortage.item_code}`} className="text-xs text-red-700">
                      {shortage.item_name || shortage.item_code} : {formatQuantity(shortage.required)} demandé,{" "}
                      {formatQuantity(shortage.available)} disponible
                      {shortage.warehouse ? ` · ${shortage.warehouse}` : ""}
                    </p>
                  ))}
                </div>
              );
            })}
          </div>

          <p className="mt-4 t-meta text-muted-foreground">{footerHint}</p>
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Annuler
          </Button>
          <Button
            ref={confirmButtonRef}
            type="button"
            onClick={onConfirm}
            disabled={creating || nothingToPick || !orders.length}
          >
            <ClipboardList />
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
