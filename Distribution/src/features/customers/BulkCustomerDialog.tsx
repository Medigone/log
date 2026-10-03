import { useEffect, useState } from "react";
import { AlertTriangle, ListChecks } from "lucide-react";
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
import { Spinner } from "@/components/ui/spinner";
import { namesToOptions } from "@/features/catalog/catalogShared";
import { BULK_CLEAR, BULK_KEEP, bulkChanges } from "@/features/customers/customerShared";
import type { BulkCustomerChanges, CustomerOptions } from "@/shared/api/customers";
import { apiErrorMessage } from "@/shared/api/distribution";

export function BulkCustomerDialog({
  open,
  onOpenChange,
  count,
  options,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  count: number;
  options?: CustomerOptions;
  onSubmit: (changes: BulkCustomerChanges) => Promise<void>;
}) {
  const [status, setStatus] = useState(BULK_KEEP);
  const [customerGroup, setCustomerGroup] = useState(BULK_KEEP);
  const [priceList, setPriceList] = useState(BULK_KEEP);
  const [paymentTerms, setPaymentTerms] = useState(BULK_KEEP);
  const [activity, setActivity] = useState(BULK_KEEP);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setStatus(BULK_KEEP);
    setCustomerGroup(BULK_KEEP);
    setPriceList(BULK_KEEP);
    setPaymentTerms(BULK_KEEP);
    setActivity(BULK_KEEP);
    setError("");
  }, [open]);

  const changes = bulkChanges({ status, customerGroup, priceList, paymentTerms, activity });
  const canSave = Object.keys(changes).length > 0 && !pending;
  const keep = { value: BULK_KEEP, label: "Ne pas modifier" };
  const clear = { value: BULK_CLEAR, label: "Vider le champ" };

  const submit = async () => {
    if (!canSave) return;
    setPending(true);
    setError("");
    try {
      await onSubmit(changes);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm:max-w-lg">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListChecks className="size-5 text-brand-600" /> Modifier {count} client{count > 1 ? "s" : ""}
            </DialogTitle>
            <DialogDescription>Seuls les champs choisis sont modifiés ; les autres restent inchangés.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <FieldGroup className="gap-3">
              {error ? (
                <Alert variant="destructive">
                  <AlertTriangle />
                  <AlertTitle>Modification impossible</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <Field>
                <FieldLabel>Statut</FieldLabel>
                <FormSelect aria-label="Statut" value={status} onChange={setStatus} options={[keep, ...namesToOptions(options?.statuses)]} />
              </Field>
              <Field>
                <FieldLabel>Catégorie client</FieldLabel>
                <FormSelect
                  aria-label="Catégorie client"
                  value={customerGroup}
                  onChange={setCustomerGroup}
                  options={[keep, ...namesToOptions(options?.customer_groups)]}
                />
              </Field>
              <Field>
                <FieldLabel>Liste de prix</FieldLabel>
                <FormSelect
                  aria-label="Liste de prix"
                  value={priceList}
                  onChange={setPriceList}
                  options={[keep, clear, ...namesToOptions(options?.price_lists)]}
                />
              </Field>
              <Field>
                <FieldLabel>Conditions de paiement</FieldLabel>
                <FormSelect
                  aria-label="Conditions de paiement"
                  value={paymentTerms}
                  onChange={setPaymentTerms}
                  options={[keep, clear, ...namesToOptions(options?.payment_terms_templates)]}
                />
              </Field>
              <Field>
                <FieldLabel>Activation</FieldLabel>
                <FormSelect
                  aria-label="Activation"
                  value={activity}
                  onChange={setActivity}
                  options={[keep, { value: "enable", label: "Réactiver" }, { value: "disable", label: "Désactiver" }]}
                />
              </Field>
            </FieldGroup>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!canSave}>
              {pending ? <Spinner /> : null}
              Appliquer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
