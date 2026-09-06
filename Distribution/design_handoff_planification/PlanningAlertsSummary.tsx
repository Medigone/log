import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DeliveryNoteAssignment } from "@/shared/types/distribution";

/** Compact red chip for the PageHeader; toggles the detail cards below. */
export function AnomalyChip({
  count,
  open,
  onToggle,
}: {
  count: number;
  open: boolean;
  onToggle: () => void;
}) {
  if (count === 0) return null;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="inline-flex h-[22px] items-center gap-1.5 whitespace-nowrap rounded-full border border-red-200 bg-red-50 px-2 text-xs font-semibold text-red-700 hover:bg-red-100"
    >
      <span className="size-1.5 rounded-full bg-red-600" />
      {count} anomalie{count > 1 ? "s" : ""}
    </button>
  );
}

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
        "flex flex-col gap-1.5 rounded-lg border p-3.5",
        danger ? "border-red-200 bg-red-50/40" : "border-amber-200 bg-amber-50/40",
      )}
    >
      <div className="flex items-center gap-2">
        <span className={cn("size-1.5 rounded-full", danger ? "bg-red-600" : "bg-amber-600")} />
        <span className={cn("text-sm font-semibold", danger ? "text-red-900" : "text-amber-900")}>
          {title}
        </span>
        <Badge variant="secondary" className="tabular-nums">
          {count}
        </Badge>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{body}</p>
      <button
        type="button"
        onClick={onAction}
        className={cn(
          "w-fit text-xs font-medium hover:underline",
          danger ? "text-red-700" : "text-amber-700",
        )}
      >
        {actionLabel} →
      </button>
    </div>
  );
}

export interface PlanningAlertsSummaryProps {
  /** Unplanned BLs whose requested date is in the past. */
  lateAssignments: DeliveryNoteAssignment[];
  /** BLs carrying planningAlert or requiresCustomerGeolocation. */
  alertAssignments: DeliveryNoteAssignment[];
  onSelectLate: () => void;
  onFilterAlerts: () => void;
}

export function PlanningAlertsSummary({
  lateAssignments,
  alertAssignments,
  onSelectLate,
  onFilterAlerts,
}: PlanningAlertsSummaryProps) {
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
          body="GPS client manquant : l’arrêt sera livré sans itinéraire calculé."
          actionLabel="Filtrer ces BL"
          onAction={onFilterAlerts}
        />
      )}
    </div>
  );
}
