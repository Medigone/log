import { useMemo, useState } from "react";
import type { ItemAnalyticsRow } from "@/shared/api/analytics";
import { formatMoney } from "@/shared/format";
import { formatDays, formatPercent, QUADRANTS } from "@/features/analytics/analyticsShared";

const WIDTH = 640;
const HEIGHT = 300;
const PAD = { top: 16, right: 16, bottom: 34, left: 48 };
const MAX_POINTS = 300;

interface Point {
  row: ItemAnalyticsRow;
  x: number;
  y: number;
  r: number;
}

/** Rotation annuelle approchée à partir de la couverture : 365 / jours de stock. */
function turns(cover: number | null) {
  if (cover == null) return null;
  return cover <= 0 ? Infinity : 365 / cover;
}

/**
 * Nuage rotation × taux de marque : chaque point est un article vendu, sa surface suit sa marge.
 * Une seule série (la position dit déjà le quadrant) ; le tableau Articles sert de vue accessible.
 */
export function ProfitScatter({
  rows,
  marginThreshold,
  coverThreshold,
  onSelect,
}: {
  rows: ItemAnalyticsRow[];
  marginThreshold: number | null;
  coverThreshold: number | null;
  onSelect: (row: ItemAnalyticsRow) => void;
}) {
  const [hover, setHover] = useState<Point | null>(null);

  const chart = useMemo(() => {
    const sold = rows
      .filter((row) => row.quadrant && row.margin_rate != null)
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, MAX_POINTS);
    if (!sold.length) return null;
    const finite = sold.map((row) => turns(row.cover_days)).filter((value): value is number => value != null && Number.isFinite(value) && value > 0);
    const xMin = Math.max(Math.min(...finite, 1) / 1.5, 0.05);
    const xMax = Math.max(...finite, 12) * 1.5;
    const rates = sold.map((row) => row.margin_rate!);
    const yMin = Math.max(Math.min(0, ...rates) - 0.05, -0.5);
    const yMax = Math.min(Math.max(0.1, ...rates) + 0.05, 1);
    const maxMargin = Math.max(1, ...sold.map((row) => row.margin));
    const plotW = WIDTH - PAD.left - PAD.right;
    const plotH = HEIGHT - PAD.top - PAD.bottom;
    const sx = (value: number) => PAD.left + ((Math.log10(Math.min(Math.max(value, xMin), xMax)) - Math.log10(xMin)) / (Math.log10(xMax) - Math.log10(xMin))) * plotW;
    const sy = (value: number) => PAD.top + (1 - (Math.min(Math.max(value, yMin), yMax) - yMin) / (yMax - yMin)) * plotH;
    const points: Point[] = sold.map((row) => {
      const turn = turns(row.cover_days);
      return {
        row,
        x: sx(turn == null ? xMin : turn),
        y: sy(row.margin_rate!),
        r: 4 + Math.sqrt(Math.max(row.margin, 0) / maxMargin) * 9,
      };
    });
    const xTicks = [0.1, 0.5, 1, 2, 5, 12, 26, 52, 100, 365].filter((tick) => tick >= xMin && tick <= xMax);
    const yStep = yMax - yMin > 0.6 ? 0.2 : 0.1;
    const yTicks: number[] = [];
    for (let tick = Math.ceil(yMin / yStep) * yStep; tick <= yMax + 1e-9; tick += yStep) yTicks.push(Math.round(tick * 100) / 100);
    const thresholdTurn = turns(coverThreshold);
    return {
      points: points.sort((a, b) => b.r - a.r),
      xTicks,
      yTicks,
      sx,
      sy,
      vx: thresholdTurn != null && Number.isFinite(thresholdTurn) ? sx(thresholdTurn) : null,
      vy: marginThreshold != null ? sy(marginThreshold) : null,
    };
  }, [rows, marginThreshold, coverThreshold]);

  if (!chart) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Aucun article vendu sur la période.</p>;
  }

  const left = PAD.left;
  const right = WIDTH - PAD.right;
  const top = PAD.top;
  const bottom = HEIGHT - PAD.bottom;

  return (
    <div className="relative [--viz-series:#2a78d6] dark:[--viz-series:#3987e5]">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label="Nuage des articles : rotation annuelle en abscisse, taux de marque en ordonnée"
        onMouseLeave={() => setHover(null)}
      >
        {chart.yTicks.map((tick) => (
          <g key={`y${tick}`}>
            <line x1={left} x2={right} y1={chart.sy(tick)} y2={chart.sy(tick)} className="stroke-border" strokeWidth={tick === 0 ? 1.5 : 1} />
            <text x={left - 6} y={chart.sy(tick)} dy="0.32em" textAnchor="end" className="fill-muted-foreground text-[10px]">
              {Math.round(tick * 100)} %
            </text>
          </g>
        ))}
        {chart.xTicks.map((tick) => (
          <text key={`x${tick}`} x={chart.sx(tick)} y={bottom + 14} textAnchor="middle" className="fill-muted-foreground text-[10px]">
            {tick < 1 ? tick.toString().replace(".", ",") : tick}×
          </text>
        ))}
        <text x={(left + right) / 2} y={HEIGHT - 4} textAnchor="middle" className="fill-muted-foreground text-[10px]">
          Rotation (fois par an, échelle log) →
        </text>
        <text transform={`translate(11 ${(top + bottom) / 2}) rotate(-90)`} textAnchor="middle" className="fill-muted-foreground text-[10px]">
          Taux de marque →
        </text>

        {chart.vx != null && <line x1={chart.vx} x2={chart.vx} y1={top} y2={bottom} className="stroke-muted-foreground/50" strokeDasharray="4 4" />}
        {chart.vy != null && <line x1={left} x2={right} y1={chart.vy} y2={chart.vy} className="stroke-muted-foreground/50" strokeDasharray="4 4" />}
        <g className="fill-muted-foreground text-[10px] font-semibold uppercase tracking-wide">
          <text x={left + 6} y={top + 10}>{QUADRANTS.pepite.label}</text>
          <text x={right - 6} y={top + 10} textAnchor="end">{QUADRANTS.star.label}</text>
          <text x={left + 6} y={bottom - 6}>{QUADRANTS.poids_mort.label}</text>
          <text x={right - 6} y={bottom - 6} textAnchor="end">{QUADRANTS.locomotive.label}</text>
        </g>

        {chart.points.map((point) => (
          <g
            key={point.row.item_code}
            className="cursor-pointer"
            onMouseEnter={() => setHover(point)}
            onClick={() => onSelect(point.row)}
          >
            <circle cx={point.x} cy={point.y} r={point.r + 4} fill="transparent" />
            <circle
              cx={point.x}
              cy={point.y}
              r={point.r}
              fill="var(--viz-series)"
              fillOpacity={hover && hover.row.item_code !== point.row.item_code ? 0.35 : 0.75}
              stroke="var(--card)"
              strokeWidth={2}
            />
          </g>
        ))}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute z-10 w-56 rounded-md border bg-popover p-2.5 text-xs shadow-md"
          style={{
            left: `${Math.min((hover.x / WIDTH) * 100, 62)}%`,
            top: `${(hover.y / HEIGHT) * 100}%`,
            transform: "translate(12px, -50%)",
          }}
        >
          <p className="truncate font-semibold text-foreground">{hover.row.item_name}</p>
          <p className="t-meta text-muted-foreground">{hover.row.quadrant ? QUADRANTS[hover.row.quadrant].label : ""}</p>
          <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-muted-foreground">
            <dt>Marge</dt>
            <dd className="num text-right text-foreground">{formatMoney(hover.row.margin)}</dd>
            <dt>Taux de marque</dt>
            <dd className="num text-right text-foreground">{formatPercent(hover.row.margin_rate)}</dd>
            <dt>Couverture</dt>
            <dd className="num text-right text-foreground">{formatDays(hover.row.cover_days)}</dd>
          </dl>
        </div>
      )}
    </div>
  );
}
