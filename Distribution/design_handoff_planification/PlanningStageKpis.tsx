import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatQuantity } from "@/shared/format";

interface Tile {
  step?: string;
  label: string;
  value: string;
  unit: string;
  badge?: { text: string; tone: "danger" | "neutral" };
  barPct: number;
  barTone: "danger" | "neutral" | "success";
  onClick?: () => void;
}

const BAR_TONE = {
  danger: "bg-destructive",
  neutral: "bg-foreground",
  success: "bg-emerald-600",
} as const;

function KpiTile({ tile }: { tile: Tile }) {
  return (
    <Card
      role={tile.onClick ? "button" : undefined}
      tabIndex={tile.onClick ? 0 : undefined}
      onClick={tile.onClick}
      className={cn(
        "shadow-none",
        tile.onClick && "cursor-pointer transition-shadow hover:border-muted-foreground/30 hover:shadow-sm",
      )}
    >
      <CardContent className="flex flex-col gap-2.5 p-3.5">
        <div className="flex items-center justify-between gap-2">
          <span className="t-micro whitespace-nowrap text-muted-foreground">
            {tile.step ? `${tile.step} · ` : ""}
            {tile.label}
          </span>
          {tile.badge && (
            <span
              className={cn(
                "whitespace-nowrap rounded px-1.5 py-0.5 text-[11px] font-medium",
                tile.badge.tone === "danger"
                  ? "bg-red-50 text-red-700"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {tile.badge.text}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-1.5">
          {/* whitespace-nowrap: "40 %" wrapped onto 2 lines at ~900px and broke the baseline */}
          <span className="whitespace-nowrap text-[30px] font-semibold leading-none tracking-tight tabular-nums">
            {tile.value}
          </span>
          <span className="text-xs text-muted-foreground">{tile.unit}</span>
        </div>
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full", BAR_TONE[tile.barTone])}
            style={{ width: `${Math.min(100, Math.max(0, tile.barPct))}%` }}
          />
        </div>
      </CardContent>
    </Card>
  );
}

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
  onShowRoutes: () => void;
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
  onShowRoutes,
}: PlanningStageKpisProps) {
  const loadPct = capacityArticles ? Math.round((assignedArticles / capacityArticles) * 100) : 0;

  const tiles: Tile[] = [
    {
      step: "1",
      label: "À planifier",
      value: String(backlogCount),
      unit: `BL · ${formatQuantity(backlogArticles)} art.`,
      badge: lateCount > 0 ? { text: `${lateCount} en retard`, tone: "danger" } : undefined,
      barPct: 100,
      barTone: lateCount > 0 ? "danger" : "neutral",
      onClick: onShowBacklog,
    },
    {
      step: "2",
      label: "Brouillons",
      value: String(draftRouteCount),
      unit: `tournées · ${draftBlCount} BL`,
      badge: { text: "à publier", tone: "neutral" },
      barPct: 50,
      barTone: "neutral",
      onClick: onShowRoutes,
    },
    {
      step: "3",
      label: "Publiées",
      value: String(publishedRouteCount),
      unit: "verrouillées, départ prêt",
      barPct: 50,
      barTone: "success",
      onClick: onShowRoutes,
    },
    {
      label: `Charge du ${dayLabel}`,
      // non-breaking space keeps "40 %" on one line
      value: `${loadPct}\u00a0%`,
      unit: `${formatQuantity(assignedArticles)} / ${formatQuantity(capacityArticles)} art. affectés`,
      badge: { text: `${driverCount} livreurs`, tone: "neutral" },
      barPct: loadPct,
      barTone: loadPct >= 90 ? "danger" : "neutral",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((tile) => (
        <KpiTile key={tile.label} tile={tile} />
      ))}
    </div>
  );
}
