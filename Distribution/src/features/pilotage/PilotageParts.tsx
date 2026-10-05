import type { ReactNode } from "react";
import { AlertTriangle, LoaderCircle, RefreshCw } from "lucide-react";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { Button } from "@/components/ui/button";
import { Toolbar } from "@/components/ui/toolbar";
import { PERIOD_PRESETS } from "@/features/analytics/analyticsShared";
import type { usePeriod } from "@/features/pilotage/usePeriod";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/shared/api/distribution";

export function PeriodToolbar({ period, children }: { period: ReturnType<typeof usePeriod>; children?: ReactNode }) {
  return (
    <Toolbar>
      <div className="flex items-center gap-0.5 rounded-md border bg-background p-0.5" role="group" aria-label="Période rapide">
        {PERIOD_PRESETS.map((option) => (
          <Button
            key={option.value}
            size="sm"
            variant={period.preset === option.value ? "default" : "ghost"}
            aria-pressed={period.preset === option.value}
            onClick={() => period.pickPreset(option.value)}
          >
            {option.label}
          </Button>
        ))}
      </div>
      <DateRangeFilter from={period.draft.from} to={period.draft.to} onChange={period.pickRange} />
      {children}
    </Toolbar>
  );
}

export function RefreshButton({ onClick, busy }: { onClick: () => void; busy?: boolean }) {
  return (
    <Button variant="outline" onClick={onClick} disabled={busy}>
      {busy ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
      Actualiser
    </Button>
  );
}

export function ErrorNote({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      <AlertTriangle className="size-4 shrink-0" />
      {apiErrorMessage(error)}
    </p>
  );
}

/** Bloc titré d'un tableau de bord. */
export function Panel({ title, hint, children, className }: { title: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={cn("flex flex-col gap-3 rounded-lg border border-hairline bg-card p-4 shadow-card", className)}>
      <header className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13.5px] font-semibold">{title}</h2>
        {hint ? <span className="t-meta text-muted-foreground">{hint}</span> : null}
      </header>
      {children}
    </section>
  );
}

export interface BarRow {
  key: string;
  label: ReactNode;
  value: number;
  display: ReactNode;
  tone?: "default" | "warning" | "danger" | "success";
}

const BAR_TONE = { default: "bg-brand-500", warning: "bg-amber-500", danger: "bg-red-500", success: "bg-emerald-500" } as const;

/** Barres horizontales proportionnelles à la plus grande valeur. */
export function BarList({ rows, empty = "Aucune donnée sur la période." }: { rows: BarRow[]; empty?: string }) {
  const max = Math.max(...rows.map((row) => Math.abs(row.value)), 0);
  if (!rows.length || !max) return <p className="py-4 text-center text-[12.5px] text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((row) => (
        <li key={row.key} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
            <span className="min-w-0 truncate">{row.label}</span>
            <span className="num shrink-0 font-medium">{row.display}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", BAR_TONE[row.tone ?? "default"])} style={{ width: `${(Math.abs(row.value) / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** Histogramme vertical simple (une barre par jour ou par semaine). */
export function ColumnChart({
  points,
  format,
  label,
}: {
  points: Array<{ key: string; label: string; value: number; secondary?: number }>;
  format: (value: number) => string;
  label: string;
}) {
  const max = Math.max(...points.map((point) => point.value + (point.secondary ?? 0)), 0);
  if (!max) return <p className="py-6 text-center text-[12.5px] text-muted-foreground">Aucun montant sur la période.</p>;
  return (
    <div role="img" aria-label={label} className="flex h-40 items-end gap-[3px]">
      {points.map((point) => {
        const total = point.value + (point.secondary ?? 0);
        return (
          <div
            key={point.key}
            className="flex h-full min-w-0 flex-1 flex-col justify-end"
            title={`${point.label} : ${format(total)}${point.secondary ? ` (dont ${format(point.secondary)} sur commandes)` : ""}`}
          >
            {point.secondary ? <div className="rounded-t-sm bg-brand-300" style={{ height: `${(point.secondary / max) * 100}%` }} /> : null}
            <div
              className={cn("bg-brand-600", point.secondary ? "" : "rounded-t-sm")}
              style={{ height: `${(point.value / max) * 100}%`, minHeight: point.value ? 2 : 0 }}
            />
          </div>
        );
      })}
    </div>
  );
}
