import { AlertsChip } from "@/features/today/AlertsSummary";
import { cn } from "@/lib/utils";
import type { DeliveryNoteAssignment } from "@/shared/types/distribution";

export { AlertsChip as PlanningAnomalyChip };

interface AlertCardProps {
  tone: "danger" | "warning";
  title: string;
  count: number;
  body: string;
  actionLabel: string;
  onAction: () => void;
}

function AlertCard({ tone, title, count, body, actionLabel, onAction }: AlertCardProps) {
  const danger = tone === "danger";
  return (
    <div
      className={cn(
        "flex flex-col gap-1.5 rounded-xl border p-3.5",
        danger ? "border-destructive/25 bg-destructive/5" : "border-warning/30 bg-warning/5",
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("size-1.5 rounded-full", danger ? "bg-destructive" : "bg-warning-foreground")} />
        <span className={cn("text-sm font-semibold", danger ? "text-destructive" : "text-warning-foreground")}>
          {title}
        </span>
        <span className="num rounded-md bg-muted px-1.5 py-px text-[11px] text-muted-foreground">{count}</span>
      </div>
      <p className="t-meta leading-relaxed text-muted-foreground">{body}</p>
      <button
        type="button"
        onClick={onAction}
        className={cn(
          "w-fit text-xs font-medium hover:underline",
          danger ? "text-destructive" : "text-warning-foreground",
        )}
      >
        {actionLabel} →
      </button>
    </div>
  );
}

export function PlanningAlertsSummary({
  lateAssignments,
  alertAssignments,
  onSelectLate,
  onFilterAlerts,
}: {
  lateAssignments: DeliveryNoteAssignment[];
  alertAssignments: DeliveryNoteAssignment[];
  onSelectLate: () => void;
  onFilterAlerts: () => void;
}) {
  if (lateAssignments.length === 0 && alertAssignments.length === 0) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {lateAssignments.length > 0 && (
        <AlertCard
          tone="danger"
          title="BL en retard, non planifiés"
          count={lateAssignments.length}
          body={`${lateAssignments.length} BL ont une date de livraison souhaitée antérieure à aujourd’hui, dont ${lateAssignments[0].deliveryNote}.`}
          actionLabel="Sélectionner ces BL"
          onAction={onSelectLate}
        />
      )}
      {alertAssignments.length > 0 && (
        <AlertCard
          tone="warning"
          title="Données client incomplètes"
          count={alertAssignments.length}
          body="GPS client manquant : le livreur collectera la position ; l’itinéraire utilisera le centre de la commune."
          actionLabel="Filtrer ces BL"
          onAction={onFilterAlerts}
        />
      )}
    </div>
  );
}
