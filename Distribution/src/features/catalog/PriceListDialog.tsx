import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { CatalogPriceList, PriceListInput } from "@/shared/api/catalog";
import { apiErrorMessage } from "@/shared/api/distribution";

export function PriceListDialog({
  open,
  onOpenChange,
  priceList,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** null : création. */
  priceList: CatalogPriceList | null;
  onSubmit: (payload: PriceListInput) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [selling, setSelling] = useState(true);
  const [buying, setBuying] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [openedFor, setOpenedFor] = useState<string | null | undefined>(undefined);

  const target = open ? (priceList?.name ?? null) : undefined;
  if (target !== openedFor) {
    setOpenedFor(target);
    if (open) {
      setName(priceList?.name || "");
      setSelling(priceList ? priceList.selling : true);
      setBuying(priceList ? priceList.buying : false);
      setEnabled(priceList ? priceList.enabled : true);
      setError("");
    }
  }

  const canSave = Boolean(name.trim() && (selling || buying)) && !pending;

  const submit = async () => {
    if (!canSave) return;
    setPending(true);
    setError("");
    try {
      await onSubmit({ name: priceList?.name, price_list_name: name.trim(), selling, buying, enabled });
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm:max-w-md">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <DialogHeader>
            <DialogTitle>{priceList ? `Liste ${priceList.name}` : "Nouvelle liste de prix"}</DialogTitle>
            <DialogDescription>
              Une liste de vente peut être attribuée à un client ou à un groupe de clients dans le Desk.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <FieldGroup className="gap-3">
              {error ? (
                <Alert variant="destructive">
                  <AlertTriangle />
                  <AlertTitle>Liste non enregistrée</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <Field>
                <FieldLabel htmlFor="price-list-name">Nom</FieldLabel>
                <Input id="price-list-name" value={name} autoFocus placeholder="Ex. Grossistes" onChange={(event) => setName(event.target.value)} />
              </Field>
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={selling} onCheckedChange={(value) => setSelling(Boolean(value))} aria-label="Vente" />
                Utilisée pour la vente
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={buying} onCheckedChange={(value) => setBuying(Boolean(value))} aria-label="Achat" />
                Utilisée pour l’achat
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox checked={enabled} onCheckedChange={(value) => setEnabled(Boolean(value))} aria-label="Active" />
                Active
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
