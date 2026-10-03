import { AlertTriangle, ClipboardList, Truck } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import type { OrderDetail } from "@/shared/api/orders";
import { formatQuantity } from "@/shared/format";

const PICK_LIST_STATES: Record<string, string> = {
  Draft: "En préparation",
  Open: "Préparée",
  Completed: "Terminée",
  Cancelled: "Annulée",
};

/** Avancement de la livraison, préparation et BL liés, et ce qui bloque l'annulation. */
export function OrderTrackingCard({ order }: { order: OrderDetail }) {
  const ordered = order.lines.reduce((sum, line) => sum + line.qty, 0);
  const remaining = order.lines.reduce((sum, line) => sum + line.remaining_qty, 0);
  const percent = Math.round(Math.min(100, Math.max(0, order.per_delivered)));
  const label =
    order.delivery_state === "livree"
      ? "Entièrement livrée"
      : order.delivery_state === "partielle"
        ? `Partiellement livrée · ${percent} %`
        : "Pas encore livrée";

  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-3.5 shadow-sm" aria-label="Suivi de la commande">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold">
          <Truck className="size-4 text-muted-foreground" /> {label}
        </span>
        <span className="text-[12.5px] text-muted-foreground">
          {formatQuantity(ordered - remaining)} livré(s) sur {formatQuantity(ordered)} · {formatQuantity(remaining)} restant(s)
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className={cn("h-full", order.delivery_state === "livree" ? "bg-emerald-600" : "bg-foreground")}
          style={{ width: `${percent}%` }}
        />
      </div>

      {order.pick_lists.length || order.delivery_notes.length ? (
        <ul className="flex flex-wrap gap-1.5 text-[12px]">
          {order.pick_lists.map((pick) => (
            <li key={pick.name} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1">
              <ClipboardList className="size-3.5 text-muted-foreground" />
              <span className="num">{pick.name}</span>
              <span className="text-muted-foreground">{PICK_LIST_STATES[pick.status || ""] || pick.status}</span>
            </li>
          ))}
          {order.delivery_notes.map((note) => (
            <li key={note.name} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1">
              <Truck className="size-3.5 text-muted-foreground" />
              <span className="num">{note.name}</span>
              <span className="text-muted-foreground">{note.status || (note.docstatus === 1 ? "Livré" : "Brouillon")}</span>
              {note.route ? <span className="num text-muted-foreground">· {note.route}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}

      {order.blockers.length ? (
        <Alert>
          <AlertTriangle />
          <AlertTitle>Annulation et suppression impossibles</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-4">
              {order.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
    </section>
  );
}
