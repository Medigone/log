import { useEffect, useState } from "react";
import { AlertTriangle, UserPlus } from "lucide-react";
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
import { apiErrorMessage } from "@/shared/api/distribution";
import { CommuneField } from "@/features/customers/CommuneField";
import type { CommuneOption, NewCustomerInput, OrderOptions } from "@/shared/api/orders";

export function QuickCustomerDialog({
  open,
  onOpenChange,
  initialName,
  options,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialName: string;
  options?: OrderOptions;
  onSubmit: (payload: NewCustomerInput) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [legalForm, setLegalForm] = useState("Non Précisé");
  const [phone, setPhone] = useState("");
  const [nif, setNif] = useState("");
  const [rc, setRc] = useState("");
  const [commune, setCommune] = useState<CommuneOption | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    setGroup("");
    setLegalForm("Non Précisé");
    setPhone("");
    setNif("");
    setRc("");
    setCommune(null);
    setError("");
  }, [open, initialName]);

  const canSave = Boolean(name.trim() && group && commune && legalForm) && !pending;

  const submit = async () => {
    if (!canSave || !commune) return;
    setPending(true);
    setError("");
    try {
      await onSubmit({
        customer_name: name.trim(),
        customer_group: group,
        commune: commune.name,
        legal_form: legalForm,
        phone: phone.trim() || undefined,
        nif: nif.trim() || undefined,
        rc: rc.trim() || undefined,
      });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm:max-w-xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-5 text-brand-600" /> Nouveau client
            </DialogTitle>
            <DialogDescription>Le client est créé « Actif » et sélectionné pour la commande.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <FieldGroup className="gap-3">
              {error ? (
                <Alert variant="destructive">
                  <AlertTriangle />
                  <AlertTitle>Impossible de créer le client</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <Field>
                <FieldLabel htmlFor="customer-name">Nom commercial</FieldLabel>
                <Input id="customer-name" value={name} autoFocus onChange={(event) => setName(event.target.value)} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Catégorie client</FieldLabel>
                  <FormSelect
                    aria-label="Catégorie client"
                    value={group}
                    onChange={setGroup}
                    options={[
                      { value: "", label: "Sélectionner" },
                      ...(options?.customer_groups || []).map((item) => ({ value: item, label: item })),
                    ]}
                  />
                </Field>
                <Field>
                  <FieldLabel>Forme juridique</FieldLabel>
                  <FormSelect
                    aria-label="Forme juridique"
                    value={legalForm}
                    onChange={setLegalForm}
                    options={(options?.legal_forms || ["Non Précisé"]).map((item) => ({ value: item, label: item }))}
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="customer-commune">Commune</FieldLabel>
                <CommuneField id="customer-commune" value={commune} onChange={setCommune} enabled={open} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="customer-phone">Téléphone</FieldLabel>
                  <Input id="customer-phone" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="customer-nif">N° NIF</FieldLabel>
                  <Input id="customer-nif" value={nif} onChange={(event) => setNif(event.target.value)} placeholder="Facultatif" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="customer-rc">N° RC</FieldLabel>
                  <Input id="customer-rc" value={rc} onChange={(event) => setRc(event.target.value)} placeholder="Facultatif" />
                </Field>
              </div>
            </FieldGroup>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!canSave}>
              {pending ? <Spinner /> : null}
              Créer le client
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
