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
import { apiErrorMessage } from "@/shared/api/distribution";
import type { NewItemInput, ReceiptOptions } from "@/shared/api/receipts";

function optionalNumber(value: string) {
  const parsed = Number(value.replace(",", "."));
  return value.trim() && Number.isFinite(parsed) ? parsed : null;
}

export function QuickItemDialog({
  open,
  onOpenChange,
  barcode,
  options,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barcode: string;
  options?: ReceiptOptions;
  onSubmit: (payload: NewItemInput) => Promise<void>;
}) {
  const [code, setCode] = useState("");
  const [itemCode, setItemCode] = useState("");
  const [itemName, setItemName] = useState("");
  const [itemGroup, setItemGroup] = useState("");
  const [brand, setBrand] = useState("");
  const [uom, setUom] = useState("");
  const [batch, setBatch] = useState(false);
  const [buyingRate, setBuyingRate] = useState("");
  const [ppa, setPpa] = useState("");
  const [sellingRate, setSellingRate] = useState("");
  const [showInStore, setShowInStore] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setCode(barcode);
    setItemCode("");
    setItemName("");
    setItemGroup("");
    setBrand("");
    setUom(options?.default_uom || "");
    setBatch(false);
    setBuyingRate("");
    setPpa("");
    setSellingRate("");
    setShowInStore(false);
    setError("");
  }, [open, barcode, options?.default_uom]);

  const canSave = Boolean(code.trim() && itemName.trim() && itemGroup && uom) && !pending;

  const submit = async () => {
    if (!canSave) return;
    setPending(true);
    setError("");
    try {
      await onSubmit({
        barcode: code.trim(),
        item_code: itemCode.trim() || undefined,
        item_name: itemName.trim(),
        item_group: itemGroup,
        brand: brand || undefined,
        stock_uom: uom,
        has_batch_no: batch,
        buying_rate: optionalNumber(buyingRate),
        ppa: optionalNumber(ppa),
        selling_rate: optionalNumber(sellingRate),
        show_in_store: showInStore,
      });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const groupOptions = [
    { value: "", label: "Sélectionner" },
    ...(options?.item_groups || []).map((name) => ({ value: name, label: name })),
  ];
  const brandOptions = [
    { value: "", label: "Aucune" },
    ...(options?.brands || []).map((name) => ({ value: name, label: name })),
  ];
  const uomOptions = (options?.uoms || []).map((name) => ({ value: name, label: name }));

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
              Article inconnu : créer la fiche
            </DialogTitle>
            <DialogDescription>
              Ce code-barres ne correspond à aucun article. Après création, l’article est ajouté à la réception.
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

              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel htmlFor="item-barcode">Code-barres</FieldLabel>
                  <Input
                    id="item-barcode"
                    value={code}
                    className="font-mono"
                    onChange={(event) => setCode(event.target.value)}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="item-code">Code article</FieldLabel>
                  <Input
                    id="item-code"
                    value={itemCode}
                    placeholder={code || "Code-barres par défaut"}
                    onChange={(event) => setItemCode(event.target.value)}
                  />
                </Field>
              </div>

              <Field>
                <FieldLabel htmlFor="item-name">Désignation</FieldLabel>
                <Input
                  id="item-name"
                  value={itemName}
                  autoFocus
                  placeholder="Ex. Lait 1er âge 400 g"
                  onChange={(event) => setItemName(event.target.value)}
                />
              </Field>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Groupe d’articles</FieldLabel>
                  <FormSelect aria-label="Groupe d’articles" value={itemGroup} onChange={setItemGroup} options={groupOptions} />
                </Field>
                <Field>
                  <FieldLabel>Marque</FieldLabel>
                  <FormSelect aria-label="Marque" value={brand} onChange={setBrand} options={brandOptions} />
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Unité de stock</FieldLabel>
                  <FormSelect aria-label="Unité de stock" value={uom} onChange={setUom} options={uomOptions} />
                </Field>
                <Field>
                  <label className="mt-6 flex items-center gap-2 text-sm font-medium">
                    <Checkbox checked={batch} onCheckedChange={(value) => setBatch(Boolean(value))} aria-label="Géré par lot" />
                    Géré par lot et péremption
                  </label>
                  <FieldDescription>Le lot et la date de péremption seront demandés à chaque réception.</FieldDescription>
                </Field>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <Field>
                  <FieldLabel htmlFor="item-buying">Prix d’achat</FieldLabel>
                  <Input
                    id="item-buying"
                    inputMode="decimal"
                    value={buyingRate}
                    onChange={(event) => setBuyingRate(event.target.value)}
                    placeholder="DZD"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="item-ppa">PPA</FieldLabel>
                  <Input
                    id="item-ppa"
                    inputMode="decimal"
                    value={ppa}
                    onChange={(event) => setPpa(event.target.value)}
                    placeholder="DZD"
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor="item-selling">Prix de vente</FieldLabel>
                  <Input
                    id="item-selling"
                    inputMode="decimal"
                    value={sellingRate}
                    onChange={(event) => setSellingRate(event.target.value)}
                    placeholder="DZD"
                  />
                </Field>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={showInStore}
                  onCheckedChange={(value) => setShowInStore(Boolean(value))}
                  aria-label="Visible sur le Store"
                />
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
              Créer et ajouter
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
