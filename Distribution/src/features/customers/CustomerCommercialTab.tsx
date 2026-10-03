import { Plus, Star, Trash2 } from "lucide-react";
import { FormSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { namesToOptions } from "@/features/catalog/catalogShared";
import type { SaveCustomer } from "@/features/customers/customerShared";
import { FormActions } from "@/features/customers/FormActions";
import { useFormSave } from "@/features/customers/useFormSave";
import type { CreditLimit, CustomerDetail, CustomerOptions } from "@/shared/api/customers";

const STARS = [1, 2, 3, 4, 5];

function StarRating({ value, onChange, label }: { value: number; onChange: (value: number) => void; label: string }) {
  const stars = Math.round(value * 5);
  return (
    <div role="radiogroup" aria-label={label} className="flex items-center gap-0.5">
      {STARS.map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={stars === star}
          aria-label={`${star} sur 5`}
          onClick={() => onChange(stars === star ? 0 : star / 5)}
          className="rounded p-0.5 text-amber-500 hover:bg-muted"
        >
          <Star className="size-5" fill={star <= stars ? "currentColor" : "none"} />
        </button>
      ))}
    </div>
  );
}

export function CustomerCommercialTab({
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
      default_price_list: customer.default_price_list || "",
      payment_terms: customer.payment_terms || "",
      is_frozen: customer.is_frozen,
      credit_limits: customer.credit_limits,
      quality_frequency: customer.quality.frequency,
      quality_interaction: customer.quality.interaction,
      quality_payments: customer.quality.payments,
      satisfaction: customer.quality.satisfaction,
    },
    onSave,
    "Conditions commerciales enregistrées",
  );
  const { values, set } = form;
  const limits = values.credit_limits ?? [];
  const companies = options?.companies ?? [];
  const usedCompanies = new Set(limits.map((row) => row.company));
  const nextCompany = companies.find((company) => !usedCompanies.has(company));

  const updateLimit = (index: number, patch: Partial<CreditLimit>) =>
    set(
      "credit_limits",
      limits.map((row, position) => (position === index ? { ...row, ...patch } : row)),
    );

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
            <CardTitle>Tarifs et paiement</CardTitle>
          </CardHeader>
          <CardContent className="pt-4">
            <FieldGroup className="gap-3">
              <Field>
                <FieldLabel>Liste de prix</FieldLabel>
                <FormSelect
                  aria-label="Liste de prix"
                  value={values.default_price_list}
                  onChange={(value) => set("default_price_list", value)}
                  options={namesToOptions(options?.price_lists, "Celle de la catégorie")}
                />
                <FieldDescription>Appliquée en saisie de commande : {customer.effective_price_list || "aucune"}.</FieldDescription>
              </Field>
              <Field>
                <FieldLabel>Conditions de paiement</FieldLabel>
                <FormSelect
                  aria-label="Conditions de paiement"
                  value={values.payment_terms}
                  onChange={(value) => set("payment_terms", value)}
                  options={namesToOptions(options?.payment_terms_templates, "Aucune")}
                />
              </Field>
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={values.is_frozen} onCheckedChange={(value) => set("is_frozen", Boolean(value))} />
                Compte gelé
                <span className="font-normal text-muted-foreground">(bloque les nouvelles écritures comptables)</span>
              </label>
            </FieldGroup>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between border-b">
            <CardTitle>Plafonds de crédit</CardTitle>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!nextCompany}
              onClick={() => nextCompany && set("credit_limits", [...limits, { company: nextCompany, credit_limit: 0, bypass_credit_limit_check: false }])}
            >
              <Plus /> Ajouter
            </Button>
          </CardHeader>
          <CardContent className="pt-4">
            {limits.length === 0 ? (
              <p className="py-3 text-center text-sm text-muted-foreground">Aucun plafond : crédit illimité.</p>
            ) : (
              <FieldGroup className="gap-3">
                {limits.map((row, index) => (
                  <div key={`${row.company}-${index}`} className="grid items-end gap-2 sm:grid-cols-[1fr_160px_auto]">
                    <Field>
                      <FieldLabel>Société</FieldLabel>
                      <FormSelect
                        aria-label="Société"
                        value={row.company}
                        onChange={(company) => updateLimit(index, { company })}
                        options={namesToOptions(companies.filter((company) => company === row.company || !usedCompanies.has(company)))}
                      />
                    </Field>
                    <Field>
                      <FieldLabel htmlFor={`credit-limit-${index}`}>Plafond (DA)</FieldLabel>
                      <Input
                        id={`credit-limit-${index}`}
                        type="number"
                        min={0}
                        step="1000"
                        value={row.credit_limit}
                        className="text-right tabular-nums"
                        onChange={(event) => updateLimit(index, { credit_limit: Number(event.target.value) || 0 })}
                      />
                    </Field>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Retirer le plafond"
                      onClick={() => set("credit_limits", limits.filter((_, position) => position !== index))}
                    >
                      <Trash2 />
                    </Button>
                    <label className="flex items-center gap-2 text-sm sm:col-span-3">
                      <Checkbox
                        checked={row.bypass_credit_limit_check}
                        onCheckedChange={(value) => updateLimit(index, { bypass_credit_limit_check: Boolean(value) })}
                      />
                      Ne pas bloquer la commande (contrôle à la facture seulement)
                    </label>
                  </div>
                ))}
              </FieldGroup>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Évaluation</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <FieldGroup className="gap-3">
            <div className="grid gap-3 sm:grid-cols-4">
              <Field>
                <FieldLabel htmlFor="quality-frequency">Fréquence</FieldLabel>
                <Input
                  id="quality-frequency"
                  type="number"
                  min={0}
                  value={values.quality_frequency}
                  onChange={(event) => set("quality_frequency", Number(event.target.value) || 0)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="quality-interaction">Interaction</FieldLabel>
                <Input
                  id="quality-interaction"
                  type="number"
                  min={0}
                  value={values.quality_interaction}
                  onChange={(event) => set("quality_interaction", Number(event.target.value) || 0)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="quality-payments">Paiements</FieldLabel>
                <Input
                  id="quality-payments"
                  type="number"
                  min={0}
                  value={values.quality_payments}
                  onChange={(event) => set("quality_payments", Number(event.target.value) || 0)}
                />
              </Field>
              <Field>
                <FieldLabel>Satisfaction</FieldLabel>
                <StarRating label="Satisfaction" value={values.satisfaction ?? 0} onChange={(value) => set("satisfaction", value)} />
              </Field>
            </div>
            {customer.quality.client ? (
              <p className="t-meta text-muted-foreground">Qualité client calculée : {Math.round(customer.quality.client * 5 * 10) / 10} / 5</p>
            ) : null}
          </FieldGroup>
        </CardContent>
      </Card>

      <FormActions dirty={form.dirty} pending={form.pending} onReset={form.reset} />
    </form>
  );
}
