import { useState } from "react";
import { toast } from "sonner";
import { Plus, Save, ScanBarcode, Trash2 } from "lucide-react";
import { BarcodeScannerDialog } from "@/components/BarcodeScannerDialog";
import { FormSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { namesToOptions } from "@/features/catalog/catalogShared";
import type { SaveItem } from "@/features/catalog/ItemDetailPage";
import type { CatalogItem, CatalogOptions } from "@/shared/api/catalog";
import { apiErrorMessage } from "@/shared/api/distribution";
import { parseDecimal } from "@/shared/format/parseDecimal";

interface BarcodeDraft {
  key: number;
  barcode: string;
  uom: string;
}

interface UomDraft {
  key: number;
  uom: string;
  factor: string;
}

let nextKey = 0;
const newKey = () => ++nextKey;

export function ItemBarcodesTab({ item, options, onSave }: { item: CatalogItem; options?: CatalogOptions; onSave: SaveItem }) {
  const [barcodes, setBarcodes] = useState<BarcodeDraft[]>(() =>
    item.barcodes.map((row) => ({ key: newKey(), barcode: row.barcode, uom: row.uom || "" })),
  );
  const [uoms, setUoms] = useState<UomDraft[]>(() =>
    item.uoms.map((row) => ({ key: newKey(), uom: row.uom, factor: String(row.conversion_factor) })),
  );
  const [scanning, setScanning] = useState(false);
  const [pending, setPending] = useState(false);

  const packUoms = uoms.map((row) => row.uom).filter(Boolean);
  const barcodeUomOptions = [
    { value: "", label: item.stock_uom },
    ...packUoms.filter((uom) => uom !== item.stock_uom).map((uom) => ({ value: uom, label: uom })),
  ];
  const uomOptions = namesToOptions((options?.uoms || []).filter((uom) => uom !== item.stock_uom), "Sélectionner");

  const updateBarcode = (key: number, patch: Partial<BarcodeDraft>) =>
    setBarcodes((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const updateUom = (key: number, patch: Partial<UomDraft>) =>
    setUoms((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const invalidUom = uoms.some((row) => row.uom && !(parseDecimal(row.factor) && (parseDecimal(row.factor) ?? 0) > 0));

  const submit = async () => {
    setPending(true);
    try {
      await onSave(
        {
          barcodes: barcodes
            .filter((row) => row.barcode.trim())
            .map((row) => ({ barcode: row.barcode.trim(), uom: row.uom && packUoms.includes(row.uom) ? row.uom : null })),
          uoms: uoms
            .filter((row) => row.uom)
            .map((row) => ({ uom: row.uom, conversion_factor: parseDecimal(row.factor) ?? 0 })),
        },
        "Codes-barres et unités enregistrés",
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
          <CardTitle>Codes-barres</CardTitle>
          <CardDescription>Un code-barres de carton ajoute toute la quantité du carton au scan.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 pt-4">
          {barcodes.length === 0 ? <p className="t-body text-muted-foreground">Aucun code-barres.</p> : null}
          {barcodes.map((row, index) => (
            <div key={row.key} className="grid grid-cols-[1fr_140px_auto] items-center gap-2">
              <Input
                value={row.barcode}
                className="font-mono"
                aria-label={`Code-barres ${index + 1}`}
                onChange={(event) => updateBarcode(row.key, { barcode: event.target.value })}
              />
              <FormSelect
                aria-label={`Unité du code-barres ${index + 1}`}
                value={row.uom}
                onChange={(value) => updateBarcode(row.key, { uom: value })}
                options={barcodeUomOptions}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Retirer le code-barres ${index + 1}`}
                onClick={() => setBarcodes((rows) => rows.filter((other) => other.key !== row.key))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setBarcodes((rows) => [...rows, { key: newKey(), barcode: "", uom: "" }])}>
              <Plus /> Ajouter
            </Button>
            <Button variant="outline" size="sm" onClick={() => setScanning(true)}>
              <ScanBarcode /> Scanner
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>Unités de conditionnement</CardTitle>
          <CardDescription>
            Combien de {item.stock_uom} contient chaque unité (ex. Carton = 12 {item.stock_uom}).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 pt-4">
          <div className="grid grid-cols-[1fr_120px_auto] items-center gap-2 t-meta text-muted-foreground">
            <span>{item.stock_uom} (unité de stock)</span>
            <span className="num text-right">1</span>
            <span className="w-9" />
          </div>
          {uoms.map((row, index) => (
            <div key={row.key} className="grid grid-cols-[1fr_120px_auto] items-center gap-2">
              <FormSelect
                aria-label={`Unité ${index + 1}`}
                value={row.uom}
                onChange={(value) => updateUom(row.key, { uom: value })}
                options={uomOptions}
              />
              <Input
                inputMode="decimal"
                value={row.factor}
                className="num text-right"
                aria-label={`Facteur de conversion ${index + 1}`}
                onChange={(event) => updateUom(row.key, { factor: event.target.value })}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Retirer l’unité ${index + 1}`}
                onClick={() => setUoms((rows) => rows.filter((other) => other.key !== row.key))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setUoms((rows) => [...rows, { key: newKey(), uom: "", factor: "" }])}>
            <Plus /> Ajouter une unité
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end lg:col-span-2">
        <Button onClick={() => void submit()} disabled={pending || invalidUom}>
          {pending ? <Spinner /> : <Save />}
          Enregistrer
        </Button>
      </div>

      <BarcodeScannerDialog
        open={scanning}
        onOpenChange={setScanning}
        onScan={(text) => {
          const code = text.trim();
          if (!code) return;
          setBarcodes((rows) => (rows.some((row) => row.barcode === code) ? rows : [...rows, { key: newKey(), barcode: code, uom: "" }]));
          setScanning(false);
        }}
      />
    </div>
  );
}
