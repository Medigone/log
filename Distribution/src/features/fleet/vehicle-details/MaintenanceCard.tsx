import { CalendarPlus, ClipboardPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { maintenanceProximity } from "@/features/fleet/vehicle-details/vehicleDetailsModel";
import { formatLongDate } from "@/shared/format";
import { cn } from "@/lib/utils";
import type { FleetVehicle } from "@/shared/types/distribution";

export function MaintenanceCard({
  vehicle,
  canWrite,
  onPlan,
  onRecord,
  className,
}: {
  vehicle: FleetVehicle;
  canWrite?: boolean;
  onPlan: () => void;
  onRecord: () => void;
  className?: string;
}) {
  const proximity = maintenanceProximity(vehicle.nextMaintenance);

  return (
    <Card size="sm" className={cn("h-full pt-2", className)}>
      <CardHeader className="items-center border-b !pb-1.5">
        <CardTitle>Prochain entretien</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-1.5">
        {vehicle.nextMaintenance ? (
          <>
            <p className="text-lg font-medium tracking-tight text-foreground">{formatLongDate(vehicle.nextMaintenance)}</p>
            {proximity ? (
              <StatusBadge tone={proximity.tone} size="sm">
                {proximity.label}
              </StatusBadge>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Non renseigné</p>
        )}
        {vehicle.lastMaintenance ? (
          <p className="text-sm text-muted-foreground">Dernier : {formatLongDate(vehicle.lastMaintenance)}</p>
        ) : null}
      </CardContent>
      {canWrite ? (
        <CardFooter className="flex flex-wrap gap-2">
          <Button size="xs" onClick={onRecord}>
            <ClipboardPlus data-icon="inline-start" />
            Enregistrer l’entretien
          </Button>
          <Button size="xs" variant="outline" onClick={onPlan}>
            <CalendarPlus data-icon="inline-start" />
            Planifier
          </Button>
        </CardFooter>
      ) : null}
    </Card>
  );
}
