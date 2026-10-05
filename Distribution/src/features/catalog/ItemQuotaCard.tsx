import { useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import type { SaveItem } from "@/features/catalog/ItemDetailPage";
import type { CatalogItem } from "@/shared/api/catalog";
import { apiErrorMessage } from "@/shared/api/distribution";
import { parseDecimal } from "@/shared/format/parseDecimal";

/** Vente en quota : quantité max par commande, dépassable par le responsable seulement. */
export function ItemQuotaCard({ item, onSave }: { item: CatalogItem; onSave: SaveItem }) {
  const [enabled, setEnabled] = useState(item.sales_quota);
  const [maxQty, setMaxQty] = useState(item.quota_max_qty ? String(item.quota_max_qty) : "");
  const [pending, setPending] = useState(false);

  const parsed = parseDecimal(maxQty);
  const valid = !enabled || (parsed != null && parsed > 0);
  const dirty = enabled !== item.sales_quota || (enabled && parsed !== item.quota_max_qty);
  const canSave = dirty && valid && !pending;

  const submit = async () => {
    if (!canSave) return;
    setPending(true);
    try {
      await onSave(
        { sales_quota: enabled, quota_max_qty: enabled ? (parsed ?? 0) : item.quota_max_qty },
        enabled ? "Vente en quota enregistrée" : "Vente en quota désactivée",
      );
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>Vente en quota</CardTitle>
        <CardDescription>Limite la quantité de l’article par commande. Le responsable peut dépasser le quota.</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox checked={enabled} onCheckedChange={(value) => setEnabled(Boolean(value))} />
            Activer la vente en quota
          </label>
          <Field>
            <FieldLabel htmlFor="item-quota-max">Quantité max par commande</FieldLabel>
            <Input
              id="item-quota-max"
              inputMode="decimal"
              className="num"
              disabled={!enabled}
              value={maxQty}
              onChange={(event) => setMaxQty(event.target.value)}
              placeholder={item.stock_uom}
            />
            {enabled && !valid ? <FieldDescription className="text-destructive">Saisissez une quantité positive.</FieldDescription> : null}
          </Field>
          <div className="flex justify-end">
            <Button type="submit" size="sm" disabled={!canSave}>
              {pending ? <Spinner /> : <Save />}
              Enregistrer le quota
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
