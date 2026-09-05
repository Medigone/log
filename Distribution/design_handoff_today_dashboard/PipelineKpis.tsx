import type { ComponentType, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PipelineStage {
  /** Ordre affiché devant le libellé : « 1 · À préparer » */
  step: number;
  title: string;
  value: number;
  unit: ReactNode;
  /** Badge d’exception affiché à droite du label, ex. « 4 en retard » */
  exception?: { label: string; tone: "danger" | "warning" };
  /** Part du flux total, 0 → 1 : longueur de la barre */
  ratio: number;
  icon?: ComponentType<{ className?: string }>;
  target?: string;
}

export function PipelineKpis({
  stages,
  onNavigate,
}: {
  stages: PipelineStage[];
  onNavigate: (target: string) => void;
}) {
  return (
    <section
      aria-label="Flux d’exploitation"
      className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      {stages.map((stage) => {
        const empty = stage.value === 0;
        const clickable = Boolean(stage.target);
        return (
          <button
            key={stage.title}
            type="button"
            disabled={!clickable}
            onClick={() => stage.target && onNavigate(stage.target)}
            className={cn(
              "flex flex-col gap-2.5 rounded-xl border border-hairline bg-card p-3.5 text-left",
              clickable && "hover:border-brand-300 hover:bg-brand-50/40",
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="num whitespace-nowrap text-[10.5px] uppercase tracking-[0.06em] text-muted-foreground">
                {stage.step} · {stage.title}
              </span>
              {stage.exception && (
                <span
                  className={cn(
                    "whitespace-nowrap rounded px-1.5 py-px text-[11px] font-medium",
                    stage.exception.tone === "danger"
                      ? "bg-destructive/10 text-destructive"
                      : "bg-warning/10 text-warning-foreground",
                  )}
                >
                  {stage.exception.label}
                </span>
              )}
            </div>

            <div className="flex items-baseline gap-1.5">
              <span
                className={cn(
                  "num text-3xl font-semibold leading-none tracking-tight",
                  empty && "text-muted-foreground/50",
                )}
              >
                {stage.value}
              </span>
              <span className="t-meta text-muted-foreground">{stage.unit}</span>
            </div>

            <div className="h-1 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-foreground"
                style={{ width: `${Math.round(Math.min(1, Math.max(0, stage.ratio)) * 100)}%` }}
              />
            </div>
          </button>
        );
      })}
    </section>
  );
}
