import { useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, Ban, LoaderCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ItemBarcodesTab } from "@/features/catalog/ItemBarcodesTab";
import { ItemGeneralTab } from "@/features/catalog/ItemGeneralTab";
import { ItemPricesTab } from "@/features/catalog/ItemPricesTab";
import { ItemStockTab } from "@/features/catalog/ItemStockTab";
import { ItemStoreTaxTab } from "@/features/catalog/ItemStoreTaxTab";
import { ItemThumb } from "@/features/catalog/ItemThumb";
import { useCatalogItem, useCatalogMutations, useCatalogOptions, type CatalogItem, type CatalogItemUpdate } from "@/shared/api/catalog";
import { apiErrorMessage } from "@/shared/api/distribution";

const TABS = ["general", "prix", "codes", "store", "stock"] as const;
type ItemTab = (typeof TABS)[number];

export type SaveItem = (changes: Omit<CatalogItemUpdate, "item_code">, message?: string) => Promise<CatalogItem>;

export function ItemDetailPage() {
  const { itemCode } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get("tab") as ItemTab | null;
  const tab: ItemTab = requested && TABS.includes(requested) ? requested : "general";
  const { data, error, isLoading, mutate } = useCatalogItem(itemCode);
  const { data: optionsData } = useCatalogOptions();
  const api = useCatalogMutations();
  const [toggling, setToggling] = useState(false);
  const item = data?.message;
  const options = optionsData?.message;

  const save: SaveItem = async (changes, message = "Article enregistré") => {
    if (!item) throw new Error("Article non chargé");
    const updated = await api.updateItem({ item_code: item.item_code, ...changes });
    await mutate({ message: updated }, { revalidate: false });
    toast.success(message);
    return updated;
  };

  const toggleDisabled = async () => {
    if (!item) return;
    setToggling(true);
    try {
      await save({ disabled: !item.disabled }, item.disabled ? "Article réactivé" : "Article désactivé");
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setToggling(false);
    }
  };

  if (error) {
    return (
      <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <AlertTriangle className="size-4 shrink-0" />
        {apiErrorMessage(error)}
      </p>
    );
  }
  if (isLoading || !item) {
    return (
      <div className="grid min-h-80 place-items-center">
        <LoaderCircle className="size-7 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Catalogue"
        title={
          <span className="flex items-center gap-3">
            <ItemThumb image={item.image} className="size-11" />
            <span className="min-w-0 truncate">{item.item_name}</span>
          </span>
        }
        description={[item.item_code, item.item_group, item.brand].filter(Boolean).join(" · ")}
        meta={
          <div className="flex flex-wrap gap-2">
            {item.disabled ? <StatusBadge tone="neutral">Désactivé</StatusBadge> : <StatusBadge tone="success">Actif</StatusBadge>}
            {item.show_in_store ? <StatusBadge tone="info">Sur le Store</StatusBadge> : null}
            {item.selling_rate == null ? <StatusBadge tone="warning">Sans prix de vente</StatusBadge> : null}
          </div>
        }
        actions={
          <Button variant="outline" onClick={() => void toggleDisabled()} disabled={toggling}>
            {toggling ? <LoaderCircle className="animate-spin" /> : item.disabled ? <RotateCcw /> : <Ban />}
            {item.disabled ? "Réactiver" : "Désactiver"}
          </Button>
        }
      />

      <Tabs
        value={tab}
        onValueChange={(value) => setSearchParams(value === "general" ? {} : { tab: String(value) }, { replace: true })}
        aria-label="Sections de la fiche article"
      >
        <TabsList variant="line">
          <TabsTrigger value="general">Général</TabsTrigger>
          <TabsTrigger value="prix">Prix</TabsTrigger>
          <TabsTrigger value="codes">Codes-barres & unités</TabsTrigger>
          <TabsTrigger value="store">Store & TVA</TabsTrigger>
          <TabsTrigger value="stock">Stock</TabsTrigger>
        </TabsList>
        <TabsContent value="general" className="pt-5">
          <ItemGeneralTab
            key={item.modified}
            item={item}
            options={options}
            onSave={save}
            onUploadImage={async (file) => {
              await api.uploadImage(item.item_code, file);
              await mutate();
              toast.success("Image enregistrée");
            }}
            onRemoveImage={async () => {
              await api.removeImage(item.item_code);
              await mutate();
            }}
            uploading={api.uploading}
          />
        </TabsContent>
        <TabsContent value="prix" className="pt-5">
          <ItemPricesTab item={item} options={options} onItemChanged={() => void mutate()} />
        </TabsContent>
        <TabsContent value="codes" className="pt-5">
          <ItemBarcodesTab key={item.modified} item={item} options={options} onSave={save} />
        </TabsContent>
        <TabsContent value="store" className="pt-5">
          <ItemStoreTaxTab key={item.modified} item={item} options={options} onSave={save} />
        </TabsContent>
        <TabsContent value="stock" className="pt-5">
          <ItemStockTab item={item} />
        </TabsContent>
      </Tabs>
    </>
  );
}
