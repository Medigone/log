import { useState } from "react";
import { AlertTriangle, BadgePercent, X } from "lucide-react";
import { FormSelect } from "@/components/FilterSelect";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { CustomerSearchField, ItemSearchField } from "@/features/catalog/CatalogPickers";
import { leafGroupOptions, namesToOptions } from "@/features/catalog/catalogShared";
import {
  RULE_APPLY_ON_LABELS,
  RULE_TARGET_LABELS,
  RULE_TYPE_LABELS,
  ruleValue,
  type CatalogOptions,
  type CustomerOption,
  type PricingRule,
  type PricingRuleApplyOn,
  type PricingRuleInput,
  type PricingRuleTarget,
  type PricingRuleType,
} from "@/shared/api/catalog";
import { apiErrorMessage } from "@/shared/api/distribution";
import { parseDecimal } from "@/shared/format/parseDecimal";

const toOptions = <T extends string>(labels: Record<T, string>) =>
  (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));

export interface RulePreset {
  apply_on: PricingRuleApplyOn;
  targets: Array<{ value: string; label: string }>;
}

export function PricingRuleDialog({
  open,
  onOpenChange,
  rule,
  preset,
  options,
  searchCustomers,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null : nouvelle promotion. */
  rule: PricingRule | null;
  preset?: RulePreset | null;
  options?: CatalogOptions;
  searchCustomers: (txt: string) => Promise<CustomerOption[]>;
  onSubmit: (payload: PricingRuleInput) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [applyOn, setApplyOn] = useState<PricingRuleApplyOn>("Item Code");
  const [targets, setTargets] = useState<Array<{ value: string; label: string }>>([]);
  const [type, setType] = useState<PricingRuleType>("Discount Percentage");
  const [value, setValue] = useState("");
  const [minQty, setMinQty] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUpto, setValidUpto] = useState("");
  const [targetFor, setTargetFor] = useState<PricingRuleTarget>("");
  const [customer, setCustomer] = useState<{ name: string; label: string } | null>(null);
  const [customerGroup, setCustomerGroup] = useState("");
  const [priceList, setPriceList] = useState("");
  const [priority, setPriority] = useState("");
  const [disabled, setDisabled] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [openedFor, setOpenedFor] = useState<string | null | undefined>(undefined);

  const target = open ? (rule?.name ?? null) : undefined;
  if (target !== openedFor) {
    setOpenedFor(target);
    if (open) {
      setTitle(rule?.title || "");
      setApplyOn((rule?.apply_on as PricingRuleApplyOn) || preset?.apply_on || "Item Code");
      setTargets(rule ? rule.targets.map((name) => ({ value: name, label: name })) : preset?.targets || []);
      setType(rule?.rate_or_discount || "Discount Percentage");
      setValue(rule ? String(ruleValue(rule)) : "");
      setMinQty(rule?.min_qty ? String(rule.min_qty) : "");
      setValidFrom(rule?.valid_from || new Date().toISOString().slice(0, 10));
      setValidUpto(rule?.valid_upto || "");
      setTargetFor((rule?.applicable_for as PricingRuleTarget) || "");
      setCustomer(rule?.applicable_for === "Customer" && rule.party ? { name: rule.party, label: rule.party } : null);
      setCustomerGroup(rule?.applicable_for === "Customer Group" ? rule.party || "" : "");
      setPriceList(rule?.for_price_list || "");
      setPriority(rule?.priority ? String(rule.priority) : "");
      setDisabled(rule?.disabled || false);
      setError("");
    }
  }

  const parsedValue = parseDecimal(value);
  const party = targetFor === "Customer" ? customer?.name || null : targetFor === "Customer Group" ? customerGroup || null : null;
  const canSave =
    Boolean(title.trim() && targets.length && parsedValue !== null && parsedValue > 0 && (!targetFor || party)) && !pending;

  const addTarget = (next: string, label = next) => {
    if (!next || targets.some((item) => item.value === next)) return;
    setTargets((current) => [...current, { value: next, label }]);
  };

  const submit = async () => {
    if (!canSave || parsedValue === null) return;
    setPending(true);
    setError("");
    try {
      await onSubmit({
        name: rule?.name,
        title: title.trim(),
        apply_on: applyOn,
        targets: targets.map((item) => item.value),
        rate_or_discount: type,
        value: parsedValue,
        min_qty: parseDecimal(minQty) ?? 0,
        valid_from: validFrom || null,
        valid_upto: validUpto || null,
        applicable_for: targetFor,
        party,
        for_price_list: priceList || null,
        priority: parseDecimal(priority),
        disabled,
      });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const groupOptions = [{ value: "", label: "Ajouter un groupe…" }, ...leafGroupOptions(options?.item_groups)];
  const brandOptions = namesToOptions(options?.brands, "Ajouter une marque…");
  const sellingLists = (options?.price_lists || []).filter((list) => list.selling);

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
              <BadgePercent className="size-5 text-brand-600" />
              {rule ? "Modifier la promotion" : "Nouvelle promotion"}
            </DialogTitle>
            <DialogDescription>Appliquée automatiquement en saisie de commande et sur le Store (prix barré).</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <FieldGroup className="gap-3">
              {error ? (
                <Alert variant="destructive">
                  <AlertTriangle />
                  <AlertTitle>Promotion non enregistrée</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <Field>
                <FieldLabel htmlFor="rule-title">Titre</FieldLabel>
                <Input id="rule-title" value={title} autoFocus placeholder="Ex. −10 % laits infantiles" onChange={(event) => setTitle(event.target.value)} />
              </Field>

              <Field>
                <FieldLabel>S’applique à</FieldLabel>
                <FormSelect
                  aria-label="S’applique à"
                  value={applyOn}
                  onChange={(next) => {
                    setApplyOn(next as PricingRuleApplyOn);
                    setTargets([]);
                  }}
                  options={toOptions(RULE_APPLY_ON_LABELS)}
                />
                {targets.length ? (
                  <ul className="flex flex-wrap gap-1.5" aria-label="Éléments concernés">
                    {targets.map((item) => (
                      <li key={item.value} className="flex items-center gap-1 rounded-md border bg-muted/50 py-0.5 pr-0.5 pl-2 text-sm">
                        <span className="max-w-60 truncate">{item.label}</span>
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Retirer ${item.label}`}
                          onClick={() => setTargets((current) => current.filter((other) => other.value !== item.value))}
                        >
                          <X />
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : null}
                {applyOn === "Item Code" ? (
                  <ItemSearchField selected={targets.map((item) => item.value)} onAdd={addTarget} />
                ) : (
                  <FormSelect
                    aria-label={applyOn === "Item Group" ? "Ajouter un groupe" : "Ajouter une marque"}
                    value=""
                    onChange={(next) => addTarget(next)}
                    options={applyOn === "Item Group" ? groupOptions : brandOptions}
                  />
                )}
              </Field>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field>
                  <FieldLabel>Type</FieldLabel>
                  <FormSelect aria-label="Type de remise" value={type} onChange={(next) => setType(next as PricingRuleType)} options={toOptions(RULE_TYPE_LABELS)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="rule-value">{type === "Discount Percentage" ? "Remise (%)" : type === "Rate" ? "Prix (DZD)" : "Remise (DZD)"}</FieldLabel>
                  <Input id="rule-value" inputMode="decimal" value={value} onChange={(event) => setValue(event.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="rule-min-qty">Dès la quantité</FieldLabel>
                  <Input id="rule-min-qty" inputMode="decimal" value={minQty} placeholder="1" onChange={(event) => setMinQty(event.target.value)} />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="rule-from">Du</FieldLabel>
                  <Input id="rule-from" type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="rule-upto">Au (facultatif)</FieldLabel>
                  <Input id="rule-upto" type="date" value={validUpto} onChange={(event) => setValidUpto(event.target.value)} />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Clients</FieldLabel>
                  <FormSelect
                    aria-label="Clients concernés"
                    value={targetFor}
                    onChange={(next) => setTargetFor(next as PricingRuleTarget)}
                    options={toOptions(RULE_TARGET_LABELS)}
                  />
                </Field>
                {targetFor === "Customer Group" ? (
                  <Field>
                    <FieldLabel>Groupe de clients</FieldLabel>
                    <FormSelect aria-label="Groupe de clients" value={customerGroup} onChange={setCustomerGroup} options={namesToOptions(options?.customer_groups, "Sélectionner")} />
                  </Field>
                ) : targetFor === "Customer" ? (
                  <Field>
                    <FieldLabel>Client</FieldLabel>
                    <CustomerSearchField label="Client" value={customer} onChange={setCustomer} search={searchCustomers} />
                  </Field>
                ) : null}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Liste de prix</FieldLabel>
                  <FormSelect
                    aria-label="Limiter à une liste de prix"
                    value={priceList}
                    onChange={setPriceList}
                    options={[{ value: "", label: "Toutes les listes" }, ...sellingLists.map((list) => ({ value: list.name, label: list.name }))]}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="rule-priority">Priorité (1 à 20)</FieldLabel>
                  <Input id="rule-priority" inputMode="numeric" value={priority} placeholder="Aucune" onChange={(event) => setPriority(event.target.value)} />
                  <FieldDescription>Départage deux promotions qui touchent le même article.</FieldDescription>
                </Field>
              </div>

              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={disabled} onCheckedChange={(next) => setDisabled(Boolean(next))} aria-label="Désactivée" />
                Désactivée
              </label>
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
