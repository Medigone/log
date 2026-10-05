import { ArrowRight, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { cn } from "@/lib/utils";
import { TONES } from "@/shared/design/statusTone";
import type { ItemAnalyticsData, ItemAnalyticsRow, Quadrant } from "@/shared/api/analytics";
import { formatMoney } from "@/shared/format";
import {
  ALERT_LABELS,
  alertDetail,
  formatDays,
  formatPercent,
  primaryAction,
  priorityActions,
  QUADRANT_ORDER,
  QUADRANTS,
} from "@/features/analytics/analyticsShared";
import { ProfitScatter } from "@/features/analytics/ProfitScatter";

export function DecisionPanel({
  data,
  onPickQuadrant,
  onOpenItem,
}: {
  data: ItemAnalyticsData;
  onPickQuadrant: (quadrant: Quadrant) => void;
  onOpenItem: (row: ItemAnalyticsRow) => void;
}) {
  const matrix = data.thresholds.matrix;
  const actions = priorityActions(data.items);

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Card>
        <CardHeader className="border-b border-hairline">
          <CardTitle>Matrice marge × rotation</CardTitle>
          <p className="t-meta text-muted-foreground">
            Seuils = médianes des articles vendus : taux de marque {formatPercent(matrix.margin_rate)}, couverture {formatDays(matrix.cover_days)}.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-4">
          <div className="grid grid-cols-2 gap-2" aria-label="Quadrants">
            {QUADRANT_ORDER.map((key) => (
              <QuadrantTile key={key} quadrant={key} data={data} onClick={() => onPickQuadrant(key)} />
            ))}
          </div>
          <ProfitScatter
            rows={data.items}
            marginThreshold={matrix.margin_rate}
            coverThreshold={matrix.cover_days}
            onSelect={onOpenItem}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b border-hairline">
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-brand-600" />
            Actions prioritaires
          </CardTitle>
          <p className="t-meta text-muted-foreground">Articles classés par montant en jeu : perte, stock immobilisé ou marge menacée.</p>
        </CardHeader>
        <CardContent className="p-0">
          {actions.length ? (
            <ol className="divide-y divide-hairline">
              {actions.map((row, index) => (
                <PriorityRow key={row.item_code} rank={index + 1} row={row} onOpen={() => onOpenItem(row)} />
              ))}
            </ol>
          ) : (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">Aucune action urgente sur la période.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function QuadrantTile({ quadrant, data, onClick }: { quadrant: Quadrant; data: ItemAnalyticsData; onClick: () => void }) {
  const meta = QUADRANTS[quadrant];
  const summary = data.quadrants[quadrant];
  const top = data.items
    .filter((row) => row.quadrant === quadrant)
    .sort((a, b) => b.margin - a.margin)
    .slice(0, 3);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex min-w-0 flex-col gap-1.5 rounded-lg border p-3 text-left transition-colors hover:brightness-[0.98]", TONES[meta.tone].surface)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn("font-semibold", TONES[meta.tone].text)}>{meta.label}</span>
        <span className="num text-lg font-semibold text-foreground">{summary.count}</span>
      </div>
      <p className="t-meta text-muted-foreground">{meta.axes}</p>
      <p className="text-xs text-foreground">
        Marge <span className="num font-medium">{formatMoney(summary.margin)}</span>
        <span className="text-muted-foreground"> · stock </span>
        <span className="num">{formatMoney(summary.stock_value)}</span>
      </p>
      {top.length > 0 && <p className="truncate t-meta text-muted-foreground">{top.map((row) => row.item_name).join(", ")}</p>}
      <p className="mt-auto flex items-center gap-1 text-xs font-medium text-foreground">
        {meta.action}
        <ArrowRight className="size-3" />
      </p>
    </button>
  );
}

function PriorityRow({ rank, row, onOpen }: { rank: number; row: ItemAnalyticsRow; onOpen: () => void }) {
  const alerts = row.alerts.filter((alert) => alert.code !== "estimated_cost").sort((a, b) => b.impact - a.impact);
  const main = alerts[0];
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-muted/50">
        <span className="num mt-0.5 grid size-6 shrink-0 place-items-center rounded-md bg-surface-subtle text-xs font-semibold text-muted-foreground">
          {rank}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-medium">{row.item_name}</span>
            {alerts.slice(0, 2).map((alert) => (
              <StatusBadge key={alert.code} tone={alert.tone} size="sm">
                {ALERT_LABELS[alert.code]}
              </StatusBadge>
            ))}
          </div>
          {main && <p className="mt-0.5 t-meta text-muted-foreground">{alertDetail(main)}</p>}
          <p className="mt-1 text-xs font-medium text-foreground">→ {primaryAction(row)}</p>
        </div>
        <span className="num shrink-0 text-right text-sm font-semibold">{formatMoney(row.impact)}</span>
      </button>
    </li>
  );
}
