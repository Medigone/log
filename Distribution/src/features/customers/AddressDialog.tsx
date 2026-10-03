import { useEffect, useState } from "react";
import { AlertTriangle, MapPinned } from "lucide-react";
import { FormSelect } from "@/components/FilterSelect";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ADDRESS_TYPE_LABELS } from "@/features/customers/customerShared";
import type { AddressInput, CustomerAddress, CustomerDetail } from "@/shared/api/customers";
import { apiErrorMessage } from "@/shared/api/distribution";

function emptyAddress(customer: CustomerDetail): AddressInput {
  return {
    customer: customer.name,
    address_title: customer.customer_name,
    address_type: "Shipping",
    address_line1: "",
    address_line2: "",
    city: customer.commune_name || "",
    state: customer.wilaya || "",
    pincode: "",
    phone: customer.phone || "",
    email: "",
    is_primary: customer.addresses.length === 0,
    is_shipping: true,
  };
}

function fromAddress(customer: CustomerDetail, address: CustomerAddress): AddressInput {
  return {
    customer: customer.name,
    name: address.name,
    address_title: address.address_title,
    address_type: address.address_type,
    address_line1: address.address_line1,
    address_line2: address.address_line2,
    city: address.city,
    state: address.state,
    pincode: address.pincode,
    phone: address.phone,
    email: address.email,
    is_primary: address.is_primary,
    is_shipping: address.is_shipping,
  };
}

export function AddressDialog({
  open,
  onOpenChange,
  customer,
  address,
  addressTypes,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customer: CustomerDetail;
  address: CustomerAddress | null;
  addressTypes?: string[];
  onSubmit: (payload: AddressInput) => Promise<void>;
}) {
  const [values, setValues] = useState<AddressInput>(() => emptyAddress(customer));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setValues(address ? fromAddress(customer, address) : emptyAddress(customer));
    setError("");
  }, [open, address, customer]);

  const set = <K extends keyof AddressInput>(key: K, value: AddressInput[K]) => setValues((current) => ({ ...current, [key]: value }));
  const canSave = Boolean(values.address_line1.trim() && values.city.trim()) && !pending;

  const submit = async () => {
    if (!canSave) return;
    setPending(true);
    setError("");
    try {
      await onSubmit(values);
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
              <MapPinned className="size-5 text-brand-600" /> {address ? "Modifier l’adresse" : "Nouvelle adresse"}
            </DialogTitle>
            <DialogDescription>{customer.customer_name}</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <FieldGroup className="gap-3">
              {error ? (
                <Alert variant="destructive">
                  <AlertTriangle />
                  <AlertTitle>Impossible d’enregistrer l’adresse</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                <Field>
                  <FieldLabel htmlFor="address-title">Intitulé</FieldLabel>
                  <Input id="address-title" value={values.address_title} onChange={(event) => set("address_title", event.target.value)} />
                </Field>
                <Field>
                  <FieldLabel>Type</FieldLabel>
                  <FormSelect
                    aria-label="Type d’adresse"
                    value={values.address_type}
                    onChange={(value) => set("address_type", value)}
                    options={(addressTypes ?? Object.keys(ADDRESS_TYPE_LABELS)).map((value) => ({
                      value,
                      label: ADDRESS_TYPE_LABELS[value] ?? value,
                    }))}
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="address-line1">Adresse</FieldLabel>
                <Input id="address-line1" value={values.address_line1} autoFocus onChange={(event) => set("address_line1", event.target.value)} />
              </Field>
              <Field>
                <FieldLabel htmlFor="address-line2">Complément</FieldLabel>
                <Input id="address-line2" value={values.address_line2} onChange={(event) => set("address_line2", event.target.value)} placeholder="Facultatif" />
              </Field>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="address-city">Ville / commune</FieldLabel>
                  <Input id="address-city" value={values.city} onChange={(event) => set("city", event.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="address-state">Wilaya</FieldLabel>
                  <Input id="address-state" value={values.state} onChange={(event) => set("state", event.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="address-pincode">Code postal</FieldLabel>
                  <Input id="address-pincode" value={values.pincode} onChange={(event) => set("pincode", event.target.value)} />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="address-phone">Téléphone</FieldLabel>
                  <Input id="address-phone" inputMode="tel" value={values.phone} onChange={(event) => set("phone", event.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="address-email">E-mail</FieldLabel>
                  <Input id="address-email" type="email" value={values.email} onChange={(event) => set("email", event.target.value)} />
                </Field>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox checked={values.is_primary} onCheckedChange={(value) => set("is_primary", Boolean(value))} />
                  Adresse principale
                </label>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox checked={values.is_shipping} onCheckedChange={(value) => set("is_shipping", Boolean(value))} />
                  Adresse de livraison
                </label>
              </div>
            </FieldGroup>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!canSave}>
              {pending ? <Spinner /> : null}
              Enregistrer
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
