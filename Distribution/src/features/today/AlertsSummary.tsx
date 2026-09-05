import { useNavigate } from "react-router-dom";
import { AlertTriangle, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { ActivityAlert } from "@/shared/types/distribution";

/** Chip compact affiché à côté du titre de page. */
export function AlertsChip({
  count,
  open,
  onToggle,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  if (!count) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full border border-destructive/25 bg-destructive/10 px-2 text-xs font-semibold text-destructive hover:bg-destructive/15"
    >
      <span className="size-1.5 rounded-full bg-destructive" />
      {count} anomalie{count > 1 ? "s" : ""}
    </button>
  );
}

/** Détail des anomalies, replié par défaut (piloté par AlertsChip). */
export function AlertsSummary({ alerts }: { alerts: ActivityAlert[] }) {
  const navigate = useNavigate();
  if (!alerts.length) return null;

  const sorted = [...alerts].sort(
    (a, b) => Number(b.tone === "danger") - Number(a.tone === "danger"),
  );

  return (
    <section aria-label="Anomalies" className="grid gap-3 sm:grid-cols-3">
      {sorted.map((alert) => {
        const danger = alert.tone === "danger";
        return (
          <div
            key={alert.id}
            className={cn(
              "flex flex-col gap-1.5 rounded-xl border p-3",
              danger
                ? "border-destructive/25 bg-destructive/5"
                : "border-warning/30 bg-warning/5",
            )}
          >
            <div className="flex items-center gap-2">
              <AlertTriangle
                className={cn("size-3.5", danger ? "text-destructive" : "text-warning-foreground")}
              />
              <p
                className={cn(
                  "text-sm font-semibold",
                  danger ? "text-destructive" : "text-warning-foreground",
                )}
              >
                {alert.title}
              </p>
            </div>
            <p className="t-meta text-muted-foreground">{alert.detail}</p>
            {alert.target && (
              <Button
                variant="ghost"
                size="sm"
                className="h-auto w-fit p-0 text-xs font-medium"
                onClick={() => navigate(alert.target!)}
              >
                Traiter
                <ArrowRight data-icon="inline-end" />
              </Button>
            )}
          </div>
        );
      })}
    </section>
  );
}
