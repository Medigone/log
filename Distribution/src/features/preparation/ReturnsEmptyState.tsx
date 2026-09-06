import { PreparationKpiTile } from "@/features/preparation/PreparationStageKpis";

export type ReturnControlMetrics = {
  declared: number;
  discrepancies: number;
  averageControlDelay: number | null;
  days?: number;
};

export function ReturnMetricsTiles({ metrics }: { metrics?: ReturnControlMetrics }) {
  if (!metrics) return null;
  return (
    <section aria-label="Retours · 30 jours" className="grid gap-3 sm:grid-cols-3">
      <PreparationKpiTile
        label="Retours déclarés · 30 j"
        value={metrics.declared}
        unit="tournées"
        ratio={metrics.declared ? 1 : 0}
      />
      <PreparationKpiTile
        label="Écarts de comptage"
        value={metrics.discrepancies}
        unit="exceptions responsable"
        ratio={metrics.discrepancies ? 1 : 0}
        barTone={metrics.discrepancies ? "danger" : "default"}
      />
      {metrics.averageControlDelay != null ? (
        <PreparationKpiTile
          label="Délai moyen de contrôle"
          value={metrics.averageControlDelay}
          unit="minutes après retour dépôt"
          ratio={1}
        />
      ) : (
        <div className="flex flex-col gap-2.5 rounded-xl border border-dashed border-input bg-card p-3.5">
          <span className="num whitespace-nowrap text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
            Délai moyen de contrôle
          </span>
          <p className="t-meta text-muted-foreground">Aucun retour confirmé sur 30 jours</p>
        </div>
      )}
    </section>
  );
}
