import { Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import type { DistributionRoute } from "@/shared/types/distribution";
import { cashReconciliation, formatDinars, returnedArticleCount, routeProgress } from "@/features/driver/driverMobile";
import { cn } from "@/lib/utils";

/**
 * Bilan de fin de journée. Une seule question : combien je remets,
 * et est-ce que ça tombe juste. Le montant à remettre passe en tête,
 * l'écart est affiché explicitement même à zéro.
 */
export function CashHandoverSummary({
  route,
  cashBoxValidated,
  onDeclare,
  onOpenHistory,
  weeklyDeliveryCount,
}: {
  route: DistributionRoute;
  cashBoxValidated: boolean;
  onDeclare: () => void;
  onOpenHistory: () => void;
  weeklyDeliveryCount?: number;
}) {
  const progress = routeProgress(route.stops);
  const cash = cashReconciliation(route.stops, route.expectedCash);
  const returned = returnedArticleCount(route.stops);
  const paidStopCount = route.stops.filter((stop) => (stop.collectedAmount || 0) > 0).length;

  return (
    <div className="flex flex-col">
      <header className="-mx-4 -mt-4 bg-foreground px-4.5 pb-5 pt-2 text-background">
        <div className="flex items-center justify-between gap-2.5">
          <p className="t-micro text-background/60">À remettre au dépôt</p>
          <StatusBadge tone={cashBoxValidated ? "positive" : "warning"} size="sm">
            {cashBoxValidated ? "Caisse validée" : "Caisse non validée"}
          </StatusBadge>
        </div>
        <p className="num mt-2 text-[40px] font-medium leading-none tracking-tight">
          {formatDinars(cash.total)}
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-2.5">
          <div className="rounded-xl bg-background/10 px-3 py-2.5">
            <dt className="text-xs text-background/60">Espèces</dt>
            <dd className="num mt-0.5 whitespace-nowrap text-[17px] font-medium">{formatDinars(cash.cash, false)}</dd>
          </div>
          <div className="rounded-xl bg-background/10 px-3 py-2.5">
            <dt className="text-xs text-background/60">Chèques · {cash.chequeCount}</dt>
            <dd className="num mt-0.5 whitespace-nowrap text-[17px] font-medium">{formatDinars(cash.cheque, false)}</dd>
          </div>
        </dl>
      </header>

      <div className="flex flex-col gap-3 pt-3.5">
        <Card density="touch" className="shrink-0 overflow-hidden p-0">
          <div className="flex items-center justify-between border-b px-3.5 py-3">
            <h3 className="text-sm font-semibold">Rapprochement</h3>
            <StatusBadge tone={cash.balanced ? "positive" : "critical"} size="sm">
              {cash.balanced ? "Aucun écart" : "Écart à justifier"}
            </StatusBadge>
          </div>
          <dl>
            <div className="flex items-center justify-between border-b px-3.5 py-2.5">
              <dt className="text-sm text-muted-foreground">Encaissé sur {paidStopCount} arrêts</dt>
              <dd className="num whitespace-nowrap text-sm font-medium">{formatDinars(cash.total)}</dd>
            </div>
            <div className="flex items-center justify-between border-b px-3.5 py-2.5">
              <dt className="text-sm text-muted-foreground">Attendu sur les BL livrés</dt>
              <dd className="num whitespace-nowrap text-sm font-medium">{formatDinars(cash.expected)}</dd>
            </div>
            <div
              className={cn(
                "flex items-center justify-between px-3.5 py-2.5",
                cash.balanced ? "bg-emerald-50" : "bg-rose-50",
              )}
            >
              <dt className={cn("text-sm font-semibold", cash.balanced ? "text-emerald-900" : "text-rose-900")}>
                Écart
              </dt>
              <dd
                className={cn(
                  "num whitespace-nowrap text-[15px] font-semibold",
                  cash.balanced ? "text-emerald-600" : "text-rose-600",
                )}
              >
                {formatDinars(cash.gap)}
              </dd>
            </div>
          </dl>
        </Card>

        <Card density="touch" className="shrink-0 p-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Journée</h3>
            <span className="num text-[13px] text-muted-foreground">
              {[route.actualStart?.slice(11, 16), route.actualEnd?.slice(11, 16)].filter(Boolean).join(" → ") || "—"}
            </span>
          </div>
          <div className="mt-3 flex gap-0.5" role="img" aria-label="Répartition des résultats d'arrêts">
            {progress.delivered ? (
              <span className="h-2 rounded-l-sm bg-emerald-500" style={{ flex: progress.delivered }} />
            ) : null}
            {progress.partial ? <span className="h-2 bg-amber-500" style={{ flex: progress.partial }} /> : null}
            {progress.failed ? (
              <span className="h-2 rounded-r-sm bg-rose-500" style={{ flex: progress.failed }} />
            ) : null}
          </div>
          <dl className="mt-3 grid grid-cols-3 gap-2">
            {(
              [
                [progress.delivered, "Livrés", "text-emerald-600"],
                [progress.partial, "Partiel", "text-amber-600"],
                [progress.failed, "Échecs", "text-rose-600"],
              ] as Array<[number, string, string]>
            ).map(([value, label, tone]) => (
              <div key={label}>
                <dd className="num text-[19px] font-medium">{value}</dd>
                <dt className={cn("text-xs font-semibold", tone)}>{label}</dt>
              </div>
            ))}
          </dl>
        </Card>

        {returned > 0 ? (
          <Card density="touch" className="flex shrink-0 items-start gap-2.5 border-amber-200 bg-amber-50 p-3.5">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-background text-amber-700">
              <Undo2 className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-amber-900">{returned} articles à retourner</p>
              <p className="mt-0.5 text-xs leading-snug text-amber-900/85">
                {progress.failed} BL non livrés + {progress.partial} partiel. Le préparateur recomptera à l'arrivée.
              </p>
            </div>
          </Card>
        ) : null}

        <div className="flex shrink-0 items-center justify-between gap-2.5 px-1">
          <span className="text-[13px] text-muted-foreground">
            Cette semaine{weeklyDeliveryCount != null ? ` · ${weeklyDeliveryCount} livraisons` : ""}
          </span>
          <button type="button" onClick={onOpenHistory} className="text-[13px] font-semibold">
            Voir l'historique →
          </button>
        </div>
      </div>

      <div className="sticky bottom-20 mt-3 border-t bg-background pt-3">
        <Button size="touch" className="h-14 w-full text-base" onClick={onDeclare} disabled={cashBoxValidated}>
          {cashBoxValidated ? "Remise de caisse déclarée" : "Déclarer ma remise de caisse"}
        </Button>
      </div>
    </div>
  );
}
