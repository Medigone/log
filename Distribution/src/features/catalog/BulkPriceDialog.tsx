import { useState } from "react";
import { AlertTriangle, WandSparkles } from "lucide-react";
import { FormSelect } from "@/components/FilterSelect";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { leafGroupOptions, namesToOptions } from "@/features/catalog/catalogShared";
import { BULK_OPERATION_LABELS, type BulkOperation, type BulkPriceInput, type BulkPriceResult, type CatalogOptions } from "@/shared/api/catalog";
import { apiErrorMessage } from "@/shared/api/distribution";
import { formatMoney } from "@/shared/format";
import { parseDecimal } from "@/shared/format/parseDecimal";

const OPERATIONS = (Object.keys(BULK_OPERATION_LABELS) as BulkOperation[]).map((value) => ({ value, label: BULK_OPERATION_LABELS[value] }));
const ROUNDING = [
  { value: "2", label: "Au centime" },
  { value: "0", label: "Au dinar" },
  { value: "-1", label: "À 10 DZD" },
  { value: "-2", label: "À 100 DZD" },
];

export function BulkPriceDialog({
  open,
  onOpenChange,
  priceList,
  options,
  defaultGroup,
  defaultBrand,
  run,
  onApplied,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  priceList: string;
  options?: CatalogOptions;
  defaultGroup: string;
  defaultBrand: string;
  run: (payload: BulkPriceInput) => Promise<BulkPriceResult>;
  onApplied: (result: BulkPriceResult) => void;
}) {
  const [operation, setOperation] = useState<BulkOperation>("percent");
  const [value, setValue] = useState("");
  const [itemGroup, setItemGroup] = useState(defaultGroup);
  const [brand, setBrand] = useState(defaultBrand);
  const [rounding, setRounding] = useState("0");
  const [preview, setPreview] = useState<BulkPriceResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setOperation("percent");
      setValue("");
      setItemGroup(defaultGroup);
      setBrand(defaultBrand);
      setRounding("0");
      setPreview(null);
      setError("");
    }
  }

  const parsed = parseDecimal(value);
  const payload = (dryRun: boolean): BulkPriceInput | null =>
    parsed === null
      ? null
      : {
          price_list: priceList,
          operation,
          value: parsed,
          item_group: itemGroup || undefined,
          brand: brand || undefined,
          round_to: Number(rounding),
          dry_run: dryRun,
        };

  const execute = async (dryRun: boolean) => {
    const body = payload(dryRun);
    if (!body) return;
    setPending(true);
    setError("");
    try {
      const result = await run(body);
      if (dryRun) {
        setPreview(result);
      } else {
        onApplied(result);
        onOpenChange(false);
      }
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const changed = (setter: (value: string) => void) => (next: string) => {
    setter(next);
    setPreview(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm:max-w-2xl">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void execute(!preview);
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <WandSparkles className="size-5 text-brand-600" />
              Mise à jour en masse · {priceList}
            </DialogTitle>
            <DialogDescription>Seuls les prix génériques des articles actifs changent ; les prix client restent inchangés.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <FieldGroup className="gap-3">
              {error ? (
                <Alert variant="destructive">
                  <AlertTriangle />
                  <AlertTitle>Mise à jour impossible</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                <Field>
                  <FieldLabel>Opération</FieldLabel>
                  <FormSelect aria-label="Opération" value={operation} onChange={changed((next) => setOperation(next as BulkOperation))} options={OPERATIONS} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="bulk-value">{operation === "percent" || operation === "from_buying" ? "Taux (%)" : "Montant (DZD)"}</FieldLabel>
                  <Input id="bulk-value" inputMode="decimal" value={value} onChange={(event) => changed(setValue)(event.target.value)} placeholder={operation === "amount" ? "-50 ou 50" : ""} />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Field>
                  <FieldLabel>Groupe</FieldLabel>
                  <FormSelect aria-label="Groupe" value={itemGroup} onChange={changed(setItemGroup)} options={[{ value: "", label: "Tous" }, ...leafGroupOptions(options?.item_groups)]} />
                </Field>
                <Field>
                  <FieldLabel>Marque</FieldLabel>
                  <FormSelect aria-label="Marque" value={brand} onChange={changed(setBrand)} options={namesToOptions(options?.brands, "Toutes")} />
                </Field>
                <Field>
                  <FieldLabel>Arrondi</FieldLabel>
                  <FormSelect aria-label="Arrondi" value={rounding} onChange={changed(setRounding)} options={ROUNDING} />
                </Field>
              </div>
              {operation === "percent" || operation === "amount" ? (
                <FieldDescription>Les articles sans prix dans cette liste sont ignorés.</FieldDescription>
              ) : null}

              {preview ? (
                <section aria-label="Aperçu" className="rounded-lg border">
                  <p className="border-b px-3 py-2 text-sm font-medium">
                    {preview.count} prix modifié{preview.count > 1 ? "s" : ""}
                    {preview.count > preview.changes.length ? ` (aperçu des ${preview.changes.length} premiers)` : ""}
                  </p>
                  <ul className="max-h-60 divide-y overflow-y-auto text-sm">
                    {preview.changes.map((change) => (
                      <li key={change.item_code} className="flex items-center justify-between gap-3 px-3 py-1.5">
                        <span className="min-w-0 truncate">{change.item_name}</span>
                        <span className="num shrink-0">
                          <span className="text-muted-foreground">{change.old_rate == null ? "—" : formatMoney(change.old_rate, { precise: true })}</span>
                          {" → "}
                          <span className="font-semibold">{formatMoney(change.new_rate, { precise: true })}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}
            </FieldGroup>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            {preview ? (
              <Button type="submit" disabled={pending || preview.count === 0}>
                {pending ? <Spinner /> : null}
                Appliquer {preview.count} prix
              </Button>
            ) : (
              <Button type="submit" disabled={pending || parsed === null}>
                {pending ? <Spinner /> : null}
                Prévisualiser
              </Button>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
