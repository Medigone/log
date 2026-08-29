import { Gauge, Package, Route } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { formatQuantity } from "@/shared/format";
import { hasMetricValue } from "@/features/fleet/vehicle-details/vehicleDetailsModel";
import { cn } from "@/lib/utils";
import type { FleetVehicle } from "@/shared/types/distribution";
import type { LucideIcon } from "lucide-react";

function Metric({
  icon: Icon,
  label,
  value,
  unit,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  unit?: string;
}) {
  return (
    <div className="flex flex-1 items-start gap-3 px-1 py-1 md:px-4 md:py-2">
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon />
      </div>
      <div className="min-w-0">
        <p className="text-sm text-muted-foreground">{label}</p>
        <p className="text-lg font-medium tracking-tight text-foreground">
          <span className="num">{value}</span>
          {unit ? <span className="ml-1 text-sm font-normal text-muted-foreground">{unit}</span> : null}
        </p>
      </div>
    </div>
  );
}

export function VehicleOperationalSummary({ vehicle, className }: { vehicle: FleetVehicle; className?: string }) {
  const km = hasMetricValue(vehicle.km) ? formatQuantity(vehicle.km as number) : "Non renseigné";
  const capacity = hasMetricValue(vehicle.capacity) ? formatQuantity(vehicle.capacity as number) : "Non renseignée";
  const activeRoutes = vehicle.activeRoutes?.length ?? 0;

  return (
    <Card size="sm" className={cn("pt-2", className)}>
      <CardHeader className="items-center border-b !pb-1.5">
        <CardTitle>Situation actuelle</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 items-center">
        <div className="flex w-full flex-col md:flex-row md:items-stretch">
          <Metric icon={Gauge} label="Kilométrage" value={km} unit={hasMetricValue(vehicle.km) ? "km" : undefined} />
          <Separator className="md:hidden" />
          <Separator orientation="vertical" className="hidden md:block" />
          <Metric icon={Package} label="Capacité" value={capacity} unit={hasMetricValue(vehicle.capacity) ? "articles" : undefined} />
          <Separator className="md:hidden" />
          <Separator orientation="vertical" className="hidden md:block" />
          <Metric icon={Route} label="Tournées actives" value={String(activeRoutes)} />
        </div>
      </CardContent>
    </Card>
  );
}
