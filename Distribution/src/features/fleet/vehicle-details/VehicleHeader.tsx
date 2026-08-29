import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Ban, ChevronDown, Fuel, MoreHorizontal, Package, Pencil, RefreshCw } from "lucide-react";
import vehiclePlaceholder from "@/assets/vehicle-placeholder.png";
import { Button } from "@/components/ui/button";
import { ButtonGroup } from "@/components/ui/button-group";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { vehicleDisplayName } from "@/features/fleet/fleetHelpers";
import { vehicleMetaLine } from "@/features/fleet/vehicle-details/vehicleDetailsModel";
import { vehicleStatusTone } from "@/shared/design/statusTone";
import type { FleetVehicle } from "@/shared/types/distribution";

const VEHICLE_STATUSES = ["Disponible", "En maintenance", "Hors service"] as const;

function VehiclePhoto({
  vehicle,
  canWrite,
  uploading,
  onPick,
}: {
  vehicle: FleetVehicle;
  canWrite?: boolean;
  uploading?: boolean;
  onPick?: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const title = vehicleDisplayName(vehicle);
  const src = vehicle.imageUrl || undefined;

  const frame = (
    <div className="relative h-32 w-44 overflow-hidden rounded-xl border bg-background sm:h-36 sm:w-56">
      {src ? (
        <img src={src} alt={title} className="size-full object-contain p-2" />
      ) : (
        <img src={vehiclePlaceholder} alt="" className="size-full object-contain p-3" aria-hidden="true" />
      )}
      {uploading ? (
        <div className="absolute inset-0 flex items-center justify-center bg-background/70">
          <Spinner />
        </div>
      ) : null}
    </div>
  );

  if (!canWrite || !onPick) return frame;

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-label="Photo du véhicule"
        disabled={uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) onPick(file);
          event.target.value = "";
        }}
      />
      <button
        type="button"
        className="shrink-0 rounded-xl text-left outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        onClick={() => inputRef.current?.click()}
        aria-label={src ? "Changer la photo du véhicule" : "Ajouter une photo du véhicule"}
        disabled={uploading}
      >
        {frame}
      </button>
    </>
  );
}

export function VehicleHeader({
  vehicle,
  canWrite,
  isLoading,
  saving,
  onRefresh,
  onToggleActive,
  onOpenStock,
  onUploadImage,
  onEdit,
  onStatusChange,
}: {
  vehicle: FleetVehicle;
  canWrite?: boolean;
  isLoading?: boolean;
  saving?: boolean;
  onRefresh: () => void;
  onToggleActive: () => Promise<void>;
  onOpenStock: () => void;
  onUploadImage?: (file: File) => Promise<void>;
  onEdit?: () => void;
  onStatusChange?: (status: string) => Promise<void>;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const title = vehicleDisplayName(vehicle);
  const meta = vehicleMetaLine(vehicle);

  const runToggle = async () => {
    await onToggleActive();
    setConfirmOpen(false);
  };

  const pickImage = async (file: File) => {
    if (!onUploadImage) return;
    setUploading(true);
    try {
      await onUploadImage(file);
    } finally {
      setUploading(false);
    }
  };

  return (
    <header className="flex flex-col gap-3">
      <Link
        to="/vehicules"
        className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Retour à la liste
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-5">
          <VehiclePhoto
            vehicle={vehicle}
            canWrite={canWrite}
            uploading={uploading}
            onPick={onUploadImage ? pickImage : undefined}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
              <StatusBadge tone={vehicleStatusTone(vehicle.status, vehicle.active)}>
                {vehicle.active ? vehicle.status : "Désactivé"}
              </StatusBadge>
            </div>
            {vehicle.registration ? (
              <p className="num mt-1 text-base text-muted-foreground">{vehicle.registration}</p>
            ) : null}
            {meta ? (
              <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                {vehicle.fuelType ? <Fuel className="size-3.5 shrink-0" aria-hidden="true" /> : null}
                {meta}
              </p>
            ) : null}
          </div>
        </div>

        <ButtonGroup aria-label="Actions du véhicule">
          {canWrite && onStatusChange ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="outline" aria-label="Statut du véhicule" disabled={saving} />}
              >
                {vehicle.active ? vehicle.status : "Désactivé"}
                <ChevronDown data-icon="inline-end" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Statut</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={vehicle.status}
                    onValueChange={(value) => {
                      const next = String(value);
                      if (next !== vehicle.status) void onStatusChange(next);
                    }}
                  >
                    {VEHICLE_STATUSES.map((status) => (
                      <DropdownMenuRadioItem key={status} value={status} disabled={saving}>
                        {status}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
          <Button variant="outline" onClick={onOpenStock}>
            <Package data-icon="inline-start" />
            Voir le stock
          </Button>
          {canWrite && onEdit ? (
            <Button variant="outline" onClick={onEdit}>
              <Pencil data-icon="inline-start" />
              Modifier
            </Button>
          ) : null}
          <Button variant="outline" onClick={onRefresh} disabled={isLoading}>
            {isLoading ? <Spinner data-icon="inline-start" /> : <RefreshCw data-icon="inline-start" />}
            Actualiser
          </Button>
          {canWrite ? (
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="Autres actions" title="Autres actions" />}>
                <MoreHorizontal />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuGroup>
                  <DropdownMenuItem
                    variant={vehicle.active ? "destructive" : "default"}
                    disabled={saving}
                    onClick={() => {
                      if (vehicle.active) setConfirmOpen(true);
                      else void runToggle();
                    }}
                  >
                    <Ban />
                    {vehicle.active ? "Désactiver" : "Activer"}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </ButtonGroup>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Désactiver ce véhicule ?</DialogTitle>
            <DialogDescription>
              Il ne sera plus proposé pour les tournées tant qu’il restera désactivé.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Annuler
            </Button>
            <Button variant="destructive" onClick={() => void runToggle()} disabled={saving}>
              {saving ? <Spinner data-icon="inline-start" /> : <Ban data-icon="inline-start" />}
              Désactiver
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
