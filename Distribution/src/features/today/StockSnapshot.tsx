import { useNavigate } from "react-router-dom";
import { Package } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { ActivityStock } from "@/shared/types/distribution";

const TILES: Array<{ key: keyof ActivityStock; label: string; hint: string }> = [
  { key: "onRoute", label: "En tournée", hint: "Véhicules sur le terrain" },
  { key: "loaded", label: "Chargés", hint: "Stock à bord" },
  { key: "empty", label: "Vides", hint: "Prêts à charger" },
  { key: "missingWarehouse", label: "Sans entrepôt", hint: "À configurer" },
];

export function StockSnapshot({ stock }: { stock: ActivityStock }) {
  const navigate = useNavigate();
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Stock véhicules</CardTitle>
          <p className="t-body text-muted-foreground">Occupation des entrepôts embarqués.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/stock")}>
          Voir tout
        </Button>
      </CardHeader>
      <CardContent className="grid grid-cols-2 gap-2">
        {TILES.map((tile) => (
          <button
            key={tile.key}
            type="button"
            onClick={() => navigate("/stock")}
            className="rounded-md border border-hairline p-3 text-left hover:border-brand-300 hover:bg-brand-50/40"
          >
            <p className="t-micro text-muted-foreground">{tile.label}</p>
            <p className="num mt-1 text-xl font-semibold">{stock[tile.key]}</p>
            <p className="mt-0.5 t-meta text-muted-foreground">{tile.hint}</p>
          </button>
        ))}
      </CardContent>
    </Card>
  );
}

export function StockAlertList({
  shortageOrders,
  missingWarehouse,
}: {
  shortageOrders?: number;
  missingWarehouse?: number;
}) {
  const navigate = useNavigate();
  if (!shortageOrders && !missingWarehouse) {
    return (
      <p className="rounded-md border border-hairline bg-surface-subtle p-3 t-body text-muted-foreground">
        Aucune alerte stock.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {!!shortageOrders && (
        <button
          type="button"
          onClick={() => navigate("/preparation")}
          className="w-full rounded-md border border-red-200 bg-red-50 p-3 text-left"
        >
          <p className="flex items-center gap-2 text-sm font-medium">
            <Package className="size-4" />
            Ruptures de stock
          </p>
          <p className="mt-1 t-meta text-muted-foreground">{shortageOrders} commande(s) sans stock suffisant.</p>
        </button>
      )}
      {!!missingWarehouse && (
        <button
          type="button"
          onClick={() => navigate("/stock")}
          className="w-full rounded-md border border-amber-200 bg-amber-50 p-3 text-left"
        >
          <p className="text-sm font-medium">Entrepôts manquants</p>
          <p className="mt-1 t-meta text-muted-foreground">{missingWarehouse} véhicule(s) sans entrepôt.</p>
        </button>
      )}
    </div>
  );
}
