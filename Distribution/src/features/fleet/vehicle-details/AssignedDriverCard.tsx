import { Link } from "react-router-dom";
import { ArrowUpRight, Pencil, UserRound } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button, buttonVariants } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Empty, EmptyContent, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { personInitials } from "@/features/fleet/vehicle-details/vehicleDetailsModel";
import { cn } from "@/lib/utils";
import type { FleetVehicle } from "@/shared/types/distribution";

export function AssignedDriverCard({
  vehicle,
  canWrite,
  onAssign,
}: {
  vehicle: FleetVehicle;
  canWrite?: boolean;
  onAssign: () => void;
}) {
  const driverHref = vehicle.driver ? `/livreurs/${encodeURIComponent(vehicle.driver)}` : "";

  return (
    <Card size="sm" className="pt-2">
      <CardHeader className="items-center border-b !pb-1.5">
        <CardTitle>Chauffeur affecté</CardTitle>
        {vehicle.driver ? (
          <CardAction>
            <ButtonGroup>
              {canWrite ? (
                <Button size="icon-xs" variant="outline" onClick={onAssign} aria-label="Modifier le chauffeur">
                  <Pencil />
                </Button>
              ) : null}
              <Link
                to={driverHref}
                aria-label="Ouvrir la fiche livreur"
                data-slot="button"
                className={cn(buttonVariants({ variant: "outline", size: "icon-xs" }))}
              >
                <ArrowUpRight />
              </Link>
            </ButtonGroup>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-1 items-center">
        {vehicle.driver ? (
          <div className="flex items-center gap-3">
            <Avatar size="sm">
              <AvatarFallback>{personInitials(vehicle.driverName || vehicle.driver)}</AvatarFallback>
            </Avatar>
            <p className="min-w-0 font-medium text-foreground">{vehicle.driverName || vehicle.driver}</p>
          </div>
        ) : (
          <Empty className="p-4">
            <EmptyHeader>
              <EmptyTitle>Aucun chauffeur affecté</EmptyTitle>
            </EmptyHeader>
            {canWrite ? (
              <EmptyContent>
                <Button size="sm" onClick={onAssign}>
                  <UserRound data-icon="inline-start" />
                  Affecter un chauffeur
                </Button>
              </EmptyContent>
            ) : null}
          </Empty>
        )}
      </CardContent>
    </Card>
  );
}
