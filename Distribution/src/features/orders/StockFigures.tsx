import type { ItemStockOverview } from "@/shared/api/orders";
import { cn } from "@/lib/utils";
import { formatQuantity } from "@/shared/format";

/** Couleurs des données de stock, partagées entre la commande et l’onglet Stock de l’article. */
export const STOCK_TONE = {
  actual: "text-sky-700",
  reserved: "text-amber-700",
  ordered: "text-violet-700",
} as const;

export function availableTone(value: number) {
  return value > 0 ? "text-emerald-700" : "text-red-700";
}

/** Stock · réservé · en commande, en texte coloré (listes compactes). */
export function StockSummary({ stock, className }: { stock?: ItemStockOverview | null; className?: string }) {
  if (!stock) return null;
  return (
    <span className={cn("num", className)}>
      <span className={STOCK_TONE.actual}>Stock {formatQuantity(stock.actual_qty)}</span>
      {" · "}
      <span className={STOCK_TONE.reserved}>Réservé {formatQuantity(stock.reserved_qty)}</span>
      {" · "}
      <span className={STOCK_TONE.ordered}>En commande {formatQuantity(stock.ordered_qty)}</span>
    </span>
  );
}
