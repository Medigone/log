import { useEffect, useState } from "react";
import { AlertTriangle, Check, Plus } from "lucide-react";
import { FormSelect } from "@/components/FilterSelect";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { fleetOptionLabel, vehicleDisplayName } from "@/features/fleet/fleetHelpers";
import type { FleetOption, FleetVehicle, FleetVehicleInput } from "@/shared/types/distribution";

const FUEL_OPTIONS = [
  { value: "Diesel", label: "Diesel" },
  { value: "Essence", label: "Essence" },
  { value: "GPL", label: "GPL" },
];

const STATUS_OPTIONS = [
  { value: "Disponible", label: "Disponible" },
  { value: "En maintenance", label: "En maintenance" },
  { value: "Hors service", label: "Hors service" },
];

export function VehicleFormDialog({
  open,
  onOpenChange,
  mode,
  vehicle,
  companies,
  drivers,
  defaultCompany,
  saving,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  vehicle?: FleetVehicle | null;
  companies: FleetOption[];
  drivers?: FleetOption[];
  defaultCompany?: string;
  saving?: boolean;
  error?: string;
  onSubmit: (payload: FleetVehicleInput) => Promise<void>;
}) {
  const editing = mode === "edit";
  const [label, setLabel] = useState("");
  const [registration, setRegistration] = useState("");
  const [company, setCompany] = useState("");
  const [fuelType, setFuelType] = useState("Diesel");
  const [capacity, setCapacity] = useState("");
  const [km, setKm] = useState("");
  const [costPerKm, setCostPerKm] = useState("");
  const [status, setStatus] = useState("Disponible");
  const [driver, setDriver] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLabel(vehicle?.nom || (vehicle ? vehicleDisplayName(vehicle) : "") || "");
    setRegistration(vehicle?.registration || "");
    setCompany(vehicle?.company || defaultCompany || "");
    setFuelType(vehicle?.fuelType || "Diesel");
    setCapacity(vehicle?.capacity != null && vehicle.capacity !== 0 ? String(vehicle.capacity) : "");
    setKm(vehicle?.km != null && vehicle.km !== 0 ? String(Math.round(vehicle.km)) : "");
    setCostPerKm(vehicle?.costPerKm != null && vehicle.costPerKm !== 0 ? String(vehicle.costPerKm) : "");
    setStatus(vehicle?.status || "Disponible");
    setDriver(vehicle?.driver || "");
  }, [open, vehicle, defaultCompany]);

  const companyOptions = [
    { value: "", label: "Sélectionner" },
    ...companies.map((option) => ({ value: option.name, label: option.label })),
  ];
  if (company && !companyOptions.some((option) => option.value === company)) {
    companyOptions.push({ value: company, label: company });
  }

  const canSave = Boolean(company) && Boolean(label.trim() || registration.trim());

  const submit = async () => {
    if (!canSave) return;
    setPending(true);
    try {
      const payload: FleetVehicleInput = {
        label: label.trim(),
        registration: registration.trim(),
        company,
        fuelType,
        capacity: capacity ? Number(capacity) : null,
      };
      if (editing) {
        payload.status = status;
        payload.km = km ? Number(km) : 0;
        payload.costPerKm = costPerKm ? Number(costPerKm) : 0;
      } else {
        payload.driver = driver || null;
      }
      await onSubmit(payload);
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{editing ? "Modifier le véhicule" : "Nouveau véhicule"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Les informations s’appliquent à la fiche et aux tournées."
                : "Un entrepôt Transit est créé automatiquement à l’enregistrement."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <FieldGroup className="gap-3">
              {error ? (
                <Alert variant="destructive">
                  <AlertTriangle />
                  <AlertTitle>Impossible d’enregistrer</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="vehicle-nom">Nom</FieldLabel>
                  <Input
                    id="vehicle-nom"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    aria-label="Nom du véhicule"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="vehicle-registration">Immatriculation</FieldLabel>
                  <Input
                    id="vehicle-registration"
                    value={registration}
                    onChange={(event) => setRegistration(event.target.value)}
                    aria-label="Immatriculation"
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel>Société</FieldLabel>
                <FormSelect aria-label="Société" value={company} onChange={setCompany} options={companyOptions} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Carburant</FieldLabel>
                  <FormSelect aria-label="Carburant" value={fuelType} onChange={setFuelType} options={FUEL_OPTIONS} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="vehicle-capacity">Capacité (articles)</FieldLabel>
                  <Input
                    id="vehicle-capacity"
                    type="number"
                    min="0"
                    value={capacity}
                    onChange={(event) => setCapacity(event.target.value)}
                    aria-label="Capacité"
                  />
                </Field>
              </div>
              {editing ? (
                <>
                  <Field>
                    <FieldLabel>Statut</FieldLabel>
                    <FormSelect aria-label="Statut" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
                  </Field>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field>
                      <FieldLabel htmlFor="vehicle-km">Kilométrage</FieldLabel>
                      <Input
                        id="vehicle-km"
                        type="number"
                        min="0"
                        value={km}
                        onChange={(event) => setKm(event.target.value)}
                        aria-label="Kilométrage"
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor="vehicle-cost">Coût au km</FieldLabel>
                      <Input
                        id="vehicle-cost"
                        type="number"
                        min="0"
                        step="0.01"
                        value={costPerKm}
                        onChange={(event) => setCostPerKm(event.target.value)}
                        aria-label="Coût au km"
                      />
                    </Field>
                  </div>
                </>
              ) : (
                <Field>
                  <FieldLabel>Chauffeur</FieldLabel>
                  <FormSelect
                    aria-label="Chauffeur"
                    value={driver}
                    onChange={setDriver}
                    options={[
                      { value: "", label: "Aucun" },
                      ...(drivers || []).map((option) => ({
                        value: option.name,
                        label: fleetOptionLabel(option, "driver"),
                      })),
                    ]}
                  />
                </Field>
              )}
            </FieldGroup>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving || pending}>
              Annuler
            </Button>
            <Button type="submit" disabled={!canSave || saving || pending}>
              {saving || pending ? (
                <Spinner data-icon="inline-start" />
              ) : editing ? (
                <Check data-icon="inline-start" />
              ) : (
                <Plus data-icon="inline-start" />
              )}
              {editing ? "Enregistrer" : "Créer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
