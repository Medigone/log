import { useEffect, useState } from "react";
import { AlertTriangle, PackagePlus } from "lucide-react";
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
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { leafGroupOptions, namesToOptions } from "@/features/catalog/catalogShared";
import type { CatalogOptions, NewCatalogItemInput } from "@/shared/api/catalog";
import { apiErrorMessage } from "@/shared/api/distribution";
import { parseDecimal } from "@/shared/format/parseDecimal";

export function NewItemDialog({
  open,
  onOpenChange,
  options,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options?: CatalogOptions;
  onSubmit: (payload: NewCatalogItemInput) => Promise<void>;
}) {
  const [itemCode, setItemCode] = useState("");
  const [itemName, setItemName] = useState("");
  const [barcode, setBarcode] = useState("");
  const [itemGroup, setItemGroup] = useState("");
  const [brand, setBrand] = useState("");
  const [uom, setUom] = useState("");
  const [batch, setBatch] = useState(false);
  const [buyingRate, setBuyingRate] = useState("");
  const [ppa, setPpa] = useState("");
  const [sellingRate, setSellingRate] = useState("");
  const [showInStore, setShowInStore] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setItemCode("");
    setItemName("");
    setBarcode("");
    setItemGroup("");
    setBrand("");
    setUom(options?.default_uom || "");
    setBatch(false);
    setBuyingRate("");
    setPpa("");
    setSellingRate("");
    setShowInStore(true);
    setError("");
  }, [open, options?.default_uom]);

  const canSave = Boolean((itemCode.trim() || barcode.trim()) && itemName.trim() && itemGroup && uom) && !pending;

  const submit = async () => {
    if (!canSave) return;
    setPending(true);
    setError("");
    try {
      await onSubmit({
        item_code: itemCode.trim() || undefined,
        item_name: itemName.trim(),
        item_group: itemGroup,
        brand: brand || undefined,
        stock_uom: uom,
        has_batch_no: batch,
        barcodes: barcode.trim() ? [{ barcode: barcode.trim() }] : [],
        buying_rate: parseDecimal(buyingRate),
        ppa: parseDecimal(ppa),
        selling_rate: parseDecimal(sellingRate),
        show_in_store: showInStore,
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
              <PackagePlus className="size-5 text-brand-600" />
              Nouvel article
            </DialogTitle>
            <DialogDescription>
              Les codes-barres supplémentaires, les unités, la TVA et l’image se règlent ensuite sur la fiche.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <FieldGroup className="gap-3">
              {error ? (
                <Alert variant="destructive">
                  <AlertTriangle />
                  <AlertTitle>Impossible de créer l’article</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}

              <Field>
                <FieldLabel htmlFor="new-item-name">Désignation</FieldLabel>
                <Input
                  id="new-item-name"
                  value={itemName}
                  autoFocus
                  placeholder="Ex. Lait 1er âge 400 g"
                  onChange={(event) => setItemName(event.target.value)}
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="new-item-barcode">Code-barres</FieldLabel>
                  <Input
                    id="new-item-barcode"
                    value={barcode}
                    className="font-mono"
                    onChange={(event) => setBarcode(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-item-code">Code article</FieldLabel>
                  <Input
                    id="new-item-code"
                    value={itemCode}
                    placeholder={barcode || "Obligatoire sans code-barres"}
                    onChange={(event) => setItemCode(event.target.value)}
                  />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Groupe d’articles</FieldLabel>
                  <FormSelect
                    aria-label="Groupe d’articles"
                    value={itemGroup}
                    onChange={setItemGroup}
                    options={[{ value: "", label: "Sélectionner" }, ...leafGroupOptions(options?.item_groups)]}
                  />
                </Field>
                <Field>
                  <FieldLabel>Marque</FieldLabel>
                  <FormSelect aria-label="Marque" value={brand} onChange={setBrand} options={namesToOptions(options?.brands, "Aucune")} />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Unité de stock</FieldLabel>
                  <FormSelect aria-label="Unité de stock" value={uom} onChange={setUom} options={namesToOptions(options?.uoms)} />
                </Field>
                <Field>
                  <label className="mt-6 flex items-center gap-2 text-sm font-medium">
                    <Checkbox checked={batch} onCheckedChange={(value) => setBatch(Boolean(value))} aria-label="Géré par lot" />
                    Géré par lot et péremption
                  </label>
                  <FieldDescription>Ne peut plus changer après le premier mouvement de stock.</FieldDescription>
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="new-item-buying">Prix d’achat</FieldLabel>
                  <Input id="new-item-buying" inputMode="decimal" value={buyingRate} onChange={(event) => setBuyingRate(event.target.value)} placeholder="DZD" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-item-selling">Prix de vente</FieldLabel>
                  <Input id="new-item-selling" inputMode="decimal" value={sellingRate} onChange={(event) => setSellingRate(event.target.value)} placeholder="DZD" />
                </Field>
                <Field>
                  <FieldLabel htmlFor="new-item-ppa">PPA</FieldLabel>
                  <Input id="new-item-ppa" inputMode="decimal" value={ppa} onChange={(event) => setPpa(event.target.value)} placeholder="DZD" />
                </Field>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <Checkbox checked={showInStore} onCheckedChange={(value) => setShowInStore(Boolean(value))} aria-label="Visible sur le Store" />
                Visible sur le Store client
              </label>
            </FieldGroup>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={!canSave}>
              {pending ? <Spinner /> : null}
              Créer l’article
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
