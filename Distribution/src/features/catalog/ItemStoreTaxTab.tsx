import { useState } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import type { SaveItem } from "@/features/catalog/ItemDetailPage";
import type { CatalogItem, CatalogOptions } from "@/shared/api/catalog";
import { apiErrorMessage } from "@/shared/api/distribution";

export function ItemStoreTaxTab({ item, options, onSave }: { item: CatalogItem; options?: CatalogOptions; onSave: SaveItem }) {
  const [showInStore, setShowInStore] = useState(item.show_in_store);
  const [showPrice, setShowPrice] = useState(item.show_price_in_store);
  const [templates, setTemplates] = useState<string[]>(item.taxes.map((row) => row.item_tax_template));
  const [pending, setPending] = useState(false);
  const available = options?.item_tax_templates || [];
  const unknown = templates.filter((name) => !available.some((template) => template.name === name));

  const toggleTemplate = (name: string, checked: boolean) =>
    setTemplates((current) => (checked ? [...current, name] : current.filter((other) => other !== name)));

  const submit = async () => {
    setPending(true);
    try {
      await onSave(
        {
          show_in_store: showInStore,
          show_price_in_store: showPrice,
          taxes: templates.map((name) => ({ item_tax_template: name })),
        },
        "Store et TVA enregistrés",
      );
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Store client</CardTitle>
          <CardDescription>Le rayon affiché est le groupe d’articles. Les rayons se règlent dans Référentiels.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox checked={showInStore} onCheckedChange={(value) => setShowInStore(Boolean(value))} aria-label="Afficher dans le Store" />
            Afficher l’article dans le Store
          </label>
          <label className="flex items-center gap-2 text-sm font-medium">
            <Checkbox
              checked={showPrice}
              disabled={!showInStore}
              onCheckedChange={(value) => setShowPrice(Boolean(value))}
              aria-label="Afficher le prix dans le Store"
            />
            Afficher le prix (sinon le prix est masqué)
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>TVA de l’article</CardTitle>
          <CardDescription>Sans modèle, la TVA du document s’applique (TVA 19 % par défaut).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-4">
          {available.length === 0 ? <p className="t-body text-muted-foreground">Aucun modèle de taxe article configuré.</p> : null}
          {available.map((template) => (
            <label key={template.name} className="flex items-center gap-2 text-sm font-medium">
              <Checkbox
                checked={templates.includes(template.name)}
                onCheckedChange={(value) => toggleTemplate(template.name, Boolean(value))}
                aria-label={template.title}
              />
              {template.title}
            </label>
          ))}
          {unknown.map((name) => (
            <p key={name} className="t-meta text-muted-foreground">
              {name} (désactivé ou d’une autre société)
            </p>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end lg:col-span-2">
        <Button onClick={() => void submit()} disabled={pending}>
          {pending ? <Spinner /> : <Save />}
          Enregistrer
        </Button>
      </div>
    </div>
  );
}
