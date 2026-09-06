import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PreparationStage {
  id: string;
  step: number;
  title: string;
  value: ReactNode;
  unit: string;
  exception?: { label: string; tone: "danger" | "warning" };
  /** 0 → 1 ; omit to hide the bar */
  ratio?: number;
  barTone?: "default" | "danger" | "success";
}

export function PreparationKpiTile({
  label,
  value,
  unit,
  ratio,
  barTone = "default",
  exception,
  active,
  onClick,
}: {
  label: string;
  value: ReactNode;
  unit: string;
  ratio?: number;
  barTone?: "default" | "danger" | "success";
  exception?: { label: string; tone: "danger" | "warning" };
  active?: boolean;
  onClick?: () => void;
}) {
  const muted = value === 0 || value === "0";
  const className = cn(
    "flex flex-col gap-2.5 rounded-xl border border-hairline bg-card p-3.5 text-left",
    onClick && "hover:border-brand-300 hover:bg-brand-50/40",
    active && "border-brand-300 bg-brand-50/40",
  );
  const inner = (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="num whitespace-nowrap text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
          {label}
        </span>
        {exception && (
          <span
            className={cn(
              "whitespace-nowrap rounded px-1.5 py-px text-[11px] font-medium",
              exception.tone === "danger"
                ? "bg-destructive/10 text-destructive"
                : "bg-warning/10 text-warning-foreground",
            )}
          >
            {exception.label}
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "num text-3xl font-semibold leading-none tracking-tight",
            muted && "text-muted-foreground/50",
          )}
        >
          {value}
        </span>
        <span className="t-meta text-muted-foreground">{unit}</span>
      </div>
      {ratio != null ? (
        <div className="h-1 overflow-hidden rounded-full bg-muted">
          <div
            className={cn(
              "h-full",
              barTone === "danger"
                ? "bg-destructive"
                : barTone === "success"
                  ? "bg-emerald-600"
                  : "bg-foreground",
            )}
            style={{ width: `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%` }}
          />
        </div>
      ) : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {inner}
      </button>
    );
  }
  return <div className={className}>{inner}</div>;
}

/**
 * Tuiles d’étape Commandes / Listes / Retours — même chrome typographique.
 */
export function PreparationStageKpis({
  stages,
  active,
  onPick,
  ariaLabel = "Étapes de préparation",
  columns = 4,
}: {
  stages: PreparationStage[];
  active?: string | null;
  onPick?: (id: string) => void;
  ariaLabel?: string;
  columns?: 3 | 4;
}) {
  return (
    <section
      aria-label={ariaLabel}
      className={cn("grid gap-3 sm:grid-cols-2", columns === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4")}
    >
      {stages.map((stage) => (
        <PreparationKpiTile
          key={stage.id}
          label={`${stage.step} · ${stage.title}`}
          value={stage.value}
          unit={stage.unit}
          ratio={stage.ratio}
          barTone={stage.barTone}
          exception={stage.exception}
          active={active === stage.id}
          onClick={onPick ? () => onPick(stage.id) : undefined}
        />
      ))}
    </section>
  );
}
