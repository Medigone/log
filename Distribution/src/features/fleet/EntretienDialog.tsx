import { useEffect, useState } from "react";
import { Check, LoaderCircle } from "lucide-react";
import { FormSelect } from "@/components/FilterSelect";
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
import { Textarea } from "@/components/ui/textarea";
import type { FleetEntretienInput } from "@/shared/types/distribution";

function todayIso() {
  return new Date().toLocaleDateString("en-CA");
}

export function EntretienDialog({
  open,
  onOpenChange,
  vehicle,
  vehicleKm,
  intent,
  saving,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vehicle: string;
  vehicleKm?: number;
  intent: "plan" | "record";
  saving?: boolean;
  onSubmit: (payload: FleetEntretienInput) => Promise<void>;
}) {
  const recording = intent === "record";
  const [status, setStatus] = useState(recording ? "Terminé" : "Programmé");
  const [kind, setKind] = useState("Préventif");
  const [date, setDate] = useState(todayIso());
  const [km, setKm] = useState(vehicleKm ? String(Math.round(vehicleKm)) : "");
  const [repairs, setRepairs] = useState("");
  const [nextMaintenance, setNextMaintenance] = useState("");
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStatus(intent === "record" ? "Terminé" : "Programmé");
    setKind("Préventif");
    setDate(todayIso());
    setKm(vehicleKm ? String(Math.round(vehicleKm)) : "");
    setRepairs("");
    setNextMaintenance("");
  }, [open, intent, vehicleKm]);

  const submit = async () => {
    setPending(true);
    try {
      await onSubmit({
        vehicle,
        status,
        type: kind,
        date,
        dateEntretien: status === "Terminé" ? date : null,
        km: km ? Number(km) : null,
        repairs: repairs.trim() || null,
        nextMaintenance: nextMaintenance || null,
      });
      onOpenChange(false);
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
            <DialogTitle>{recording ? "Enregistrer un entretien" : "Planifier un entretien"}</DialogTitle>
            <DialogDescription>
              {recording
                ? "L’intervention est enregistrée et le kilométrage / prochain rendez-vous du véhicule sont mis à jour."
                : "L’échéance est posée sur la fiche véhicule. Vous pourrez la clôturer plus tard."}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <FieldGroup className="gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Statut</FieldLabel>
                  <FormSelect
                    aria-label="Statut"
                    value={status}
                    onChange={setStatus}
                    options={[
                      { value: "Programmé", label: "Programmé" },
                      { value: "En Cours", label: "En cours" },
                      { value: "Terminé", label: "Terminé" },
                    ]}
                  />
                </Field>
                <Field>
                  <FieldLabel>Type</FieldLabel>
                  <FormSelect
                    aria-label="Type d’entretien"
                    value={kind}
                    onChange={setKind}
                    options={[
                      { value: "Préventif", label: "Préventif" },
                      { value: "Correctif", label: "Correctif" },
                      { value: "Autre", label: "Autre" },
                    ]}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="entretien-date">Date</FieldLabel>
                  <Input id="entretien-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
                </Field>
                <Field>
                  <FieldLabel htmlFor="entretien-km">Kilométrage</FieldLabel>
                  <Input id="entretien-km" type="number" min="0" value={km} onChange={(event) => setKm(event.target.value)} />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="entretien-next">Prochain entretien</FieldLabel>
                <Input
                  id="entretien-next"
                  type="date"
                  value={nextMaintenance}
                  onChange={(event) => setNextMaintenance(event.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="entretien-repairs">Réparations / observations</FieldLabel>
                <Textarea
                  id="entretien-repairs"
                  value={repairs}
                  onChange={(event) => setRepairs(event.target.value)}
                  placeholder="Vidange, plaquettes, contrôle…"
                />
              </Field>
            </FieldGroup>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving || pending}>
              Annuler
            </Button>
            <Button type="submit" disabled={saving || pending || !date}>
              {saving || pending ? <LoaderCircle className="animate-spin" /> : <Check />}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
