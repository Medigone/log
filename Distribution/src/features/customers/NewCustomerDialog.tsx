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
import { namesToOptions } from "@/features/catalog/catalogShared";
import { CommuneField } from "@/features/customers/CommuneField";
import type { CustomerOptions, CustomerStatus, NewCustomerPayload } from "@/shared/api/customers";
import { apiErrorMessage } from "@/shared/api/distribution";
import type { CommuneOption } from "@/shared/api/orders";

export function NewCustomerDialog({
  open,
  onOpenChange,
  options,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options?: CustomerOptions;
  onSubmit: (payload: NewCustomerPayload) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [status, setStatus] = useState<CustomerStatus>("Actif");
  const [legalForm, setLegalForm] = useState("Non Précisé");
  const [commune, setCommune] = useState<CommuneOption | null>(null);
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [nif, setNif] = useState("");
  const [rc, setRc] = useState("");
  const [priceList, setPriceList] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName("");
    setGroup("");
    setStatus("Actif");
    setLegalForm("Non Précisé");
    setCommune(null);
    setPhone("");
    setEmail("");
    setNif("");
    setRc("");
    setPriceList("");
    setPaymentTerms("");
    setError("");
  }, [open]);

  const canSave = Boolean(name.trim() && group && commune) && !pending;

  const submit = async () => {
    if (!canSave || !commune) return;
    setPending(true);
    setError("");
    try {
      const payload: NewCustomerPayload = {
        customer_name: name.trim(),
        customer_group: group,
        commune: commune.name,
        legal_form: legalForm,
        status,
      };
      if (phone.trim()) payload.phone = phone.trim();
      if (email.trim()) payload.email = email.trim();
      if (nif.trim()) payload.nif = nif.trim();
      if (rc.trim()) payload.rc = rc.trim();
      if (priceList) payload.default_price_list = priceList;
      if (paymentTerms) payload.payment_terms = paymentTerms;
      await onSubmit(payload);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm:max-w-2xl">
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
            <DialogDescription>Les autres informations (contacts, adresses, documents, crédit) se complètent sur la fiche.</DialogDescription>
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
                <FieldLabel htmlFor="new-customer-name">Raison sociale</FieldLabel>
                <Input id="new-customer-name" value={name} autoFocus onChange={(event) => setName(event.target.value)} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field>
                  <FieldLabel>Catégorie client</FieldLabel>
                  <FormSelect
                    aria-label="Catégorie client"
                    value={group}
                    onChange={setGroup}
                    options={namesToOptions(options?.customer_groups, "Sélectionner")}
                  />
                </Field>
                <Field>
                  <FieldLabel>Statut</FieldLabel>
                  <FormSelect
                    aria-label="Statut"
                    value={status}
                    onChange={(value) => setStatus(value as CustomerStatus)}
                    options={namesToOptions(options?.statuses ?? ["Prospect", "Actif"])}
                  />
                </Field>
                <Field>
                  <FieldLabel>Forme juridique</FieldLabel>
                  <FormSelect
                    aria-label="Forme juridique"
                    value={legalForm}
                    onChange={setLegalForm}
                    options={namesToOptions(options?.legal_forms ?? ["Non Précisé"])}
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="new-customer-commune">Commune</FieldLabel>
                <CommuneField id="new-customer-commune" value={commune} onChange={setCommune} enabled={open} />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="new-customer-phone">Téléphone</FieldLabel>
                  <Input id="new-customer-phone" inputMode="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-customer-email">E-mail</FieldLabel>
                  <Input id="new-customer-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="new-customer-nif">N° NIF</FieldLabel>
                  <Input id="new-customer-nif" value={nif} onChange={(event) => setNif(event.target.value)} placeholder="Facultatif" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-customer-rc">N° RC</FieldLabel>
                  <Input id="new-customer-rc" value={rc} onChange={(event) => setRc(event.target.value)} placeholder="Facultatif" />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Liste de prix</FieldLabel>
                  <FormSelect
                    aria-label="Liste de prix"
                    value={priceList}
                    onChange={setPriceList}
                    options={namesToOptions(options?.price_lists, "Celle de la catégorie")}
                  />
                </Field>
                <Field>
                  <FieldLabel>Conditions de paiement</FieldLabel>
                  <FormSelect
                    aria-label="Conditions de paiement"
                    value={paymentTerms}
                    onChange={setPaymentTerms}
                    options={namesToOptions(options?.payment_terms_templates, "Aucune")}
                  />
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
