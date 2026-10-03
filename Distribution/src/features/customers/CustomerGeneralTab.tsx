import { FormSelect } from "@/components/FilterSelect";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { namesToOptions } from "@/features/catalog/catalogShared";
import type { SaveCustomer } from "@/features/customers/customerShared";
import { FormActions } from "@/features/customers/FormActions";
import { useFormSave } from "@/features/customers/useFormSave";
import type { CustomerDetail, CustomerOptions, CustomerStatus } from "@/shared/api/customers";

export function CustomerGeneralTab({
  customer,
  options,
  onSave,
}: {
  customer: CustomerDetail;
  options?: CustomerOptions;
  onSave: SaveCustomer;
}) {
  const form = useFormSave(
    {
      customer_name: customer.customer_name,
      customer_group: customer.customer_group || "",
      status: (customer.status || "Prospect") as CustomerStatus,
      legal_form: customer.legal_form || "Non Précisé",
      phone: customer.phone,
      email: customer.email,
      main_phone: customer.main_phone,
      fax: customer.fax,
      main_email: customer.main_email,
      existence_date: customer.existence_date || "",
      key_account: customer.key_account,
      small_quantities: customer.small_quantities,
      is_virtual: customer.is_virtual,
    },
    onSave,
    "Fiche client enregistrée",
  );
  const { values, set } = form;
  const groupOptions = namesToOptions(options?.customer_groups);
  if (customer.customer_group && !groupOptions.some((option) => option.value === customer.customer_group)) {
    groupOptions.unshift({ value: customer.customer_group, label: customer.customer_group });
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void form.submit();
      }}
      className="grid gap-4"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b">
            <CardTitle>Identité</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <FieldGroup className="gap-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_180px]">
                <Field>
                  <FieldLabel htmlFor="customer-name">Raison sociale</FieldLabel>
                  <Input id="customer-name" value={values.customer_name} onChange={(event) => set("customer_name", event.target.value)} />
                  <FieldDescription>Enregistrée en majuscules.</FieldDescription>
                </Field>
                <Field>
                  <FieldLabel htmlFor="customer-code">Code client</FieldLabel>
                  <Input id="customer-code" value={customer.name} disabled className="font-mono" />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field>
                  <FieldLabel>Catégorie client</FieldLabel>
                  <FormSelect aria-label="Catégorie client" value={values.customer_group} onChange={(value) => set("customer_group", value)} options={groupOptions} />
                </Field>
                <Field>
                  <FieldLabel>Statut</FieldLabel>
                  <FormSelect
                    aria-label="Statut"
                    value={values.status}
                    onChange={(value) => set("status", value as CustomerStatus)}
                    options={namesToOptions(options?.statuses ?? [values.status])}
                  />
                </Field>
                <Field>
                  <FieldLabel>Forme juridique</FieldLabel>
                  <FormSelect
                    aria-label="Forme juridique"
                    value={values.legal_form}
                    onChange={(value) => set("legal_form", value)}
                    options={namesToOptions(options?.legal_forms ?? [values.legal_form])}
                  />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="customer-existence">Date d’existence</FieldLabel>
                <Input
                  id="customer-existence"
                  type="date"
                  value={values.existence_date}
                  onChange={(event) => set("existence_date", event.target.value)}
                  className="sm:max-w-48"
                />
              </Field>
              <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox checked={values.key_account} onCheckedChange={(value) => set("key_account", Boolean(value))} />
                  Grand compte
                </label>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox
                    checked={values.small_quantities}
                    onCheckedChange={(value) => set("small_quantities", Boolean(value))}
                  />
                  Petites quantités
                </label>
                <label className="flex items-center gap-2 text-sm font-medium">
                  <Checkbox checked={values.is_virtual} onCheckedChange={(value) => set("is_virtual", Boolean(value))} />
                  Client virtuel
                </label>
              </div>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="border-b">
            <CardTitle>Coordonnées</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <FieldGroup className="gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="customer-phone">Téléphone</FieldLabel>
                  <Input id="customer-phone" inputMode="tel" value={values.phone} onChange={(event) => set("phone", event.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="customer-email">E-mail</FieldLabel>
                  <Input id="customer-email" type="email" value={values.email} onChange={(event) => set("email", event.target.value)} />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="customer-main-phone">Téléphone principal</FieldLabel>
                  <Input id="customer-main-phone" inputMode="tel" value={values.main_phone} onChange={(event) => set("main_phone", event.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="customer-fax">Fax</FieldLabel>
                  <Input id="customer-fax" inputMode="tel" value={values.fax} onChange={(event) => set("fax", event.target.value)} />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="customer-main-email">E-mail principal</FieldLabel>
                <Input id="customer-main-email" type="email" value={values.main_email} onChange={(event) => set("main_email", event.target.value)} />
              </Field>
              {customer.main_contact_name ? (
                <p className="t-meta text-muted-foreground">Contact principal : {customer.main_contact_name}</p>
              ) : null}
            </FieldGroup>
          </CardContent>
        </Card>
      </div>
      <FormActions dirty={form.dirty} pending={form.pending} onReset={form.reset} />
    </form>
  );
}
