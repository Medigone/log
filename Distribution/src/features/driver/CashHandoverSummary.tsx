import { LogOut, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import type { DistributionRoute } from "@/shared/types/distribution";
import { cashHandover, formatDriverMoney, remainingHandover, returnedArticleCount, routeProgress } from "@/features/driver/driverMobile";
import { formatTime } from "@/shared/format";
import { cn } from "@/lib/utils";

/**
 * Bilan de fin de journée. Une seule question : combien je remets,
 * et est-ce que ça tombe juste.
 */
export function CashHandoverSkeleton() {
  return (
    <div aria-busy="true" aria-label="Chargement du bilan">
      <div className="bg-foreground px-4 pb-8 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <Skeleton className="h-3 w-44 bg-white/15" />
        <Skeleton className="mt-4 h-10 w-56 bg-white/15" />
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Skeleton className="h-16 rounded-xl bg-white/10" />
          <Skeleton className="h-16 rounded-xl bg-white/10" />
        </div>
      </div>
      <div className="space-y-3 p-4">
        <Skeleton className="h-36 rounded-touch" />
        <Skeleton className="h-28 rounded-touch" />
      </div>
    </div>
  );
}

export function CashHandoverSummary({
  route,
  cashBoxValidated,
  onDeclare,
  onOpenHistory,
  weeklyDeliveryCount,
  onLogout,
}: {
  route?: DistributionRoute | null;
  cashBoxValidated: boolean;
  onDeclare?: () => void;
  onOpenHistory: () => void;
  weeklyDeliveryCount?: number;
  onLogout?: () => void;
}) {
  const stops = route?.stops || [];
  const progress = routeProgress(stops);
  const collected = cashHandover(stops);
  const remaining = remainingHandover(collected, cashBoxValidated);
  const returned = returnedArticleCount(stops);
  const paidStopCount = stops.filter((stop) => (stop.amountCollected || 0) > 0).length;
  const dayHours = [formatTime(route?.startedAt), formatTime(route?.finishedAt)].filter((value) => value !== "—");

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="bg-foreground px-4 pb-5 pt-[max(0.75rem,env(safe-area-inset-top))] text-background">
        <div className="flex items-center justify-between gap-2.5">
          <p className="t-micro tracking-[0.09em] text-background/60 uppercase">À remettre au dépôt</p>
          <div className="flex items-center gap-2">
            <StatusBadge tone={cashBoxValidated ? "success" : "warning"} size="sm">
              {cashBoxValidated ? "Caisse validée" : "Caisse non validée"}
            </StatusBadge>
            {onLogout ? (
              <button
                type="button"
                onClick={onLogout}
                aria-label="Se déconnecter"
                className="grid size-11 place-items-center rounded-xl bg-white/10"
              >
                <LogOut className="size-4" />
              </button>
            ) : null}
          </div>
        </div>
        <p className="num mt-2 text-[40px] leading-none font-medium tracking-tight">{formatDriverMoney(remaining.total, true)}</p>
        <dl className="mt-4 grid grid-cols-2 gap-2.5">
          <div className="rounded-xl bg-background/10 px-3 py-2.5">
            <dt className="text-xs text-background/60">Espèces</dt>
            <dd className="num mt-0.5 whitespace-nowrap text-[17px] font-medium">{formatDriverMoney(remaining.cash, false)}</dd>
          </div>
          <div className="rounded-xl bg-background/10 px-3 py-2.5">
            <dt className="text-xs text-background/60">Chèques · {remaining.chequeCount}</dt>
            <dd className="num mt-0.5 whitespace-nowrap text-[17px] font-medium">{formatDriverMoney(remaining.cheque, false)}</dd>
          </div>
        </dl>
      </header>

      <div className="flex flex-col gap-3 px-4 pt-3.5">
        <Card density="touch" className="shrink-0 overflow-hidden p-0">
          <div className="flex items-center justify-between border-b px-3.5 py-3">
            <h3 className="text-sm font-semibold">Rapprochement</h3>
            <StatusBadge tone={collected.balanced ? "success" : "danger"} size="sm">
              {collected.balanced ? "Aucun écart" : "Écart à justifier"}
            </StatusBadge>
          </div>
          <dl>
            <div className="flex items-center justify-between border-b px-3.5 py-2.5">
              <dt className="text-sm text-muted-foreground">Encaissé sur {paidStopCount} arrêts</dt>
              <dd className="num whitespace-nowrap text-sm font-medium">{formatDriverMoney(collected.total, true)}</dd>
            </div>
            <div className="flex items-center justify-between border-b px-3.5 py-2.5">
              <dt className="text-sm text-muted-foreground">Attendu sur les BL livrés</dt>
              <dd className="num whitespace-nowrap text-sm font-medium">{formatDriverMoney(collected.expected, true)}</dd>
            </div>
            <div
              className={cn("flex items-center justify-between px-3.5 py-2.5", collected.balanced ? "bg-emerald-50" : "bg-rose-50")}
            >
              <dt className={cn("text-sm font-semibold", collected.balanced ? "text-emerald-900" : "text-rose-900")}>Écart</dt>
              <dd
                className={cn(
                  "num whitespace-nowrap text-[15px] font-semibold",
                  collected.balanced ? "text-emerald-600" : "text-rose-600",
                )}
              >
                {formatDriverMoney(collected.gap, true)}
              </dd>
            </div>
          </dl>
        </Card>

        <Card density="touch" className="shrink-0 p-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Journée</h3>
            <span className="num text-[13px] text-muted-foreground">{dayHours.join(" → ") || "—"}</span>
          </div>
          <div className="mt-3 flex gap-0.5" role="img" aria-label="Répartition des résultats d'arrêts">
            {progress.delivered + progress.partial + progress.failed === 0 ? (
              <span className="h-2 flex-1 rounded-sm bg-border" />
            ) : (
              <>
                {progress.delivered ? <span className="h-2 rounded-l-sm bg-emerald-500" style={{ flex: progress.delivered }} /> : null}
                {progress.partial ? <span className="h-2 bg-amber-500" style={{ flex: progress.partial }} /> : null}
                {progress.failed ? <span className="h-2 rounded-r-sm bg-rose-500" style={{ flex: progress.failed }} /> : null}
              </>
            )}
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
                {progress.failed} BL non livrés + {progress.partial} partiel. Le préparateur recomptera à l’arrivée.
              </p>
            </div>
          </Card>
        ) : null}

        <div className="flex shrink-0 items-center justify-between gap-2.5 px-1">
          <span className="text-[13px] text-muted-foreground">
            Cette semaine{weeklyDeliveryCount != null ? ` · ${weeklyDeliveryCount} livraisons` : ""}
          </span>
          <button type="button" onClick={onOpenHistory} className="text-[13px] font-semibold">
            Voir l’historique →
          </button>
        </div>
      </div>

      <div className="sticky bottom-20 mt-auto border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {onDeclare ? (
          <Button size="touch" className="h-14 w-full text-base" onClick={onDeclare} disabled={cashBoxValidated}>
            {cashBoxValidated ? "Remise de caisse déclarée" : "Déclarer ma remise de caisse"}
          </Button>
        ) : (
          <p className="rounded-touch bg-muted px-3 py-3.5 text-center text-sm font-medium text-muted-foreground">
            La remise se fait au dépôt avec le caissier.
          </p>
        )}
      </div>
    </div>
  );
}
