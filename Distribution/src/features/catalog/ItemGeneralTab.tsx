import { useRef, useState } from "react";
import { toast } from "sonner";
import { ImagePlus, Save, Trash2 } from "lucide-react";
import { FormSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { leafGroupOptions, namesToOptions } from "@/features/catalog/catalogShared";
import type { SaveItem } from "@/features/catalog/ItemDetailPage";
import { ItemThumb } from "@/features/catalog/ItemThumb";
import type { CatalogItem, CatalogOptions } from "@/shared/api/catalog";
import { apiErrorMessage } from "@/shared/api/distribution";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

export function ItemGeneralTab({
  item,
  options,
  onSave,
  onUploadImage,
  onRemoveImage,
  uploading,
}: {
  item: CatalogItem;
  options?: CatalogOptions;
  onSave: SaveItem;
  onUploadImage: (file: File) => Promise<void>;
  onRemoveImage: () => Promise<void>;
  uploading: boolean;
}) {
  const [itemName, setItemName] = useState(item.item_name);
  const [description, setDescription] = useState(item.description);
  const [itemGroup, setItemGroup] = useState(item.item_group || "");
  const [brand, setBrand] = useState(item.brand || "");
  const [uom, setUom] = useState(item.stock_uom);
  const [batch, setBatch] = useState(item.has_batch_no);
  const [pending, setPending] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const dirty =
    itemName !== item.item_name ||
    description !== item.description ||
    itemGroup !== (item.item_group || "") ||
    brand !== (item.brand || "") ||
    uom !== item.stock_uom ||
    batch !== item.has_batch_no;
  const canSave = dirty && Boolean(itemName.trim() && itemGroup && uom) && !pending;
  const groupOptions = leafGroupOptions(options?.item_groups);
  if (item.item_group && !groupOptions.some((option) => option.value === item.item_group)) {
    groupOptions.unshift({ value: item.item_group, label: item.item_group });
  }

  const submit = async () => {
    if (!canSave) return;
    setPending(true);
    try {
      await onSave({
        item_name: itemName.trim(),
        description: description.trim(),
        item_group: itemGroup,
        brand: brand || null,
        stock_uom: uom,
        has_batch_no: batch,
      });
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setPending(false);
    }
  };

  const pickImage = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Choisissez un fichier image (JPG, PNG, WebP).");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("L’image dépasse 5 Mo.");
      return;
    }
    try {
      await onUploadImage(file);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>Informations</CardTitle>
        </CardHeader>
        <CardContent className="pt-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <FieldGroup className="gap-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
                <Field>
                  <FieldLabel htmlFor="item-name">Désignation</FieldLabel>
                  <Input id="item-name" value={itemName} onChange={(event) => setItemName(event.target.value)} />
                </Field>
                <Field>
                  <FieldLabel htmlFor="item-code">Code article</FieldLabel>
                  <Input id="item-code" value={item.item_code} disabled className="font-mono" />
                </Field>
              </div>
              <Field>
                <FieldLabel htmlFor="item-description">Description</FieldLabel>
                <Textarea
                  id="item-description"
                  value={description}
                  rows={3}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Affichée sur la fiche produit du Store"
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Groupe d’articles</FieldLabel>
                  <FormSelect aria-label="Groupe d’articles" value={itemGroup} onChange={setItemGroup} options={groupOptions} />
                </Field>
                <Field>
                  <FieldLabel>Marque</FieldLabel>
                  <FormSelect aria-label="Marque" value={brand} onChange={setBrand} options={namesToOptions(options?.brands, "Aucune")} />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field>
                  <FieldLabel>Unité de stock</FieldLabel>
                  {item.has_stock_moves ? (
                    <Input value={item.stock_uom} disabled aria-label="Unité de stock" />
                  ) : (
                    <FormSelect aria-label="Unité de stock" value={uom} onChange={setUom} options={namesToOptions(options?.uoms)} />
                  )}
                  {item.has_stock_moves ? <FieldDescription>Figée : l’article a des mouvements de stock.</FieldDescription> : null}
                </Field>
                <Field>
                  <label className="mt-6 flex items-center gap-2 text-sm font-medium">
                    <Checkbox
                      checked={batch}
                      disabled={item.has_stock_moves}
                      onCheckedChange={(value) => setBatch(Boolean(value))}
                      aria-label="Géré par lot"
                    />
                    Géré par lot et péremption
                  </label>
                </Field>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={!canSave}>
                  {pending ? <Spinner /> : <Save />}
                  Enregistrer
                </Button>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Image</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-3 pt-4">
          <ItemThumb image={item.image} className="size-48 rounded-lg" />
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Choisir une image"
            onChange={(event) => {
              void pickImage(event.target.files?.[0]);
              event.target.value = "";
            }}
          />
          <div className="flex flex-wrap justify-center gap-2">
            <Button variant="outline" size="sm" disabled={uploading} onClick={() => fileInput.current?.click()}>
              {uploading ? <Spinner /> : <ImagePlus />}
              {item.image ? "Remplacer" : "Ajouter une image"}
            </Button>
            {item.image ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={uploading}
                onClick={() => void onRemoveImage().catch((err) => toast.error(apiErrorMessage(err)))}
              >
                <Trash2 /> Retirer
              </Button>
            ) : null}
          </div>
          <p className="t-meta text-center text-muted-foreground">Visible sur le Store et en saisie de commande. 5 Mo maximum.</p>
        </CardContent>
      </Card>
    </div>
  );
}
