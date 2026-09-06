import { PreparationKpiTile } from "@/features/preparation/PreparationStageKpis";
import { formatQuantity } from "@/shared/format";

export interface PlanningStageKpisProps {
  backlogCount: number;
  backlogArticles: number;
  lateCount: number;
  draftRouteCount: number;
  draftBlCount: number;
  publishedRouteCount: number;
  assignedArticles: number;
  capacityArticles: number;
  driverCount: number;
  dayLabel: string;
  onShowBacklog: () => void;
  onShowDrafts: () => void;
  onShowPublished: () => void;
}

export function PlanningStageKpis({
  backlogCount,
  backlogArticles,
  lateCount,
  draftRouteCount,
  draftBlCount,
  publishedRouteCount,
  assignedArticles,
  capacityArticles,
  driverCount,
  dayLabel,
  onShowBacklog,
  onShowDrafts,
  onShowPublished,
}: PlanningStageKpisProps) {
  const loadPct = capacityArticles ? Math.round((assignedArticles / capacityArticles) * 100) : 0;

  return (
    <section aria-label="Étapes de planification" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <PreparationKpiTile
        label="1 · À planifier"
        value={backlogCount}
        unit={`BL · ${formatQuantity(backlogArticles)} art.`}
        ratio={1}
        barTone={lateCount > 0 ? "danger" : "default"}
        exception={lateCount > 0 ? { label: `${lateCount} en retard`, tone: "danger" } : undefined}
        onClick={onShowBacklog}
      />
      <PreparationKpiTile
        label="2 · Brouillons"
        value={draftRouteCount}
        unit={`tournées · ${draftBlCount} BL`}
        ratio={0.5}
        exception={{ label: "à publier", tone: "warning" }}
        onClick={onShowDrafts}
      />
      <PreparationKpiTile
        label="3 · Publiées"
        value={publishedRouteCount}
        unit="verrouillées, départ prêt"
        ratio={0.5}
        barTone="success"
        onClick={onShowPublished}
      />
      <PreparationKpiTile
        label={`Charge du ${dayLabel}`}
        value={capacityArticles ? `${loadPct}\u00a0%` : formatQuantity(assignedArticles)}
        unit={
          capacityArticles
            ? `${formatQuantity(assignedArticles)} / ${formatQuantity(capacityArticles)} art. · ${driverCount} livreur${driverCount > 1 ? "s" : ""}`
            : `${driverCount} livreur${driverCount > 1 ? "s" : ""} · art. affectés`
        }
        ratio={capacityArticles ? loadPct / 100 : undefined}
        barTone={loadPct >= 90 ? "danger" : "default"}
      />
    </section>
  );
}
