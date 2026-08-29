import { StatusBadge } from "@/components/ui/status-badge";
import { vehicleStatusTone } from "@/shared/design/statusTone";

export function VehicleLabel({
  label,
  status,
  active,
}: {
  label?: string | null;
  status?: string | null;
  active?: boolean | null;
}) {
  if (!label) return <span className="t-body">—</span>;
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2">
      <span className="t-body">{label}</span>
      {status ? (
        <StatusBadge tone={vehicleStatusTone(status, active ?? true)} size="sm">
          {active === false ? "Désactivé" : status}
        </StatusBadge>
      ) : null}
    </div>
  );
}
