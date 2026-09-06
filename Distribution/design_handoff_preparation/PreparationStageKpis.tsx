import { cn } from "@/lib/utils";

export interface PreparationStage {
  id: "toPick" | "inProgress" | "toComplete" | "ready";
  step: number;
  title: string;
  value: number;
  unit: string;
  exception?: { label: string; tone: "danger" | "warning" };
  /** 0 → 1 */
  ratio: number;
  barTone?: "default" | "danger" | "success";
}

/**
 * 4 tuiles d’étape : À prélever → En cours → À compléter → Prêtes à livrer.
 * Cliquer une tuile applique le filtre correspondant (pas de navigation).
 */
export function PreparationStageKpis({
  stages,
  onPick,
}: {
  stages: PreparationStage[];
  onPick: (id: PreparationStage["id"]) => void;
}) {
  return (
    <section aria-label="Étapes de préparation" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {stages.map((stage) => (
        <button
          key={stage.id}
          type="button"
          onClick={() => onPick(stage.id)}
          className="flex flex-col gap-2.5 rounded-xl border border-hairline bg-card p-3.5 text-left hover:border-brand-300 hover:bg-brand-50/40"
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
                stage.value === 0 && "text-muted-foreground/50",
              )}
            >
              {stage.value}
            </span>
            <span className="t-meta text-muted-foreground">{stage.unit}</span>
          </div>

          <div className="h-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full",
                stage.barTone === "danger"
                  ? "bg-destructive"
                  : stage.barTone === "success"
                    ? "bg-emerald-600"
                    : "bg-foreground",
              )}
              style={{ width: `${Math.round(Math.min(1, Math.max(0, stage.ratio)) * 100)}%` }}
            />
          </div>
        </button>
      ))}
    </section>
  );
}
