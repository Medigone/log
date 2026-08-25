import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, LoaderCircle, Package, RefreshCw, Search, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { apiErrorMessage, useVehicleStocks } from "@/shared/api/distribution";
import { formatQuantity } from "@/shared/format";
import type { VehicleStockLine } from "@/shared/types/distribution";

export function VehicleStockPage() {
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [itemSearch, setItemSearch] = useState("");
  const { data, error, isLoading, mutate } = useVehicleStocks();
  const vehicles = useMemo(() => data?.message || [], [data?.message]);
  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return vehicles;
    return vehicles.filter((vehicle) =>
      [vehicle.label, vehicle.registration, vehicle.warehouse, vehicle.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [search, vehicles]);
  const vehicle = filtered.find((row) => row.name === selected) || vehicles.find((row) => row.name === selected);
  const lines = useMemo(() => {
    const query = itemSearch.trim().toLowerCase();
    const source = vehicle?.lines || [];
    if (!query) return source;
    return source.filter((line) =>
      [line.itemCode, line.itemName, line.uom].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)),
    );
  }, [itemSearch, vehicle]);

  useEffect(() => {
    if (filtered.length && !filtered.some((row) => row.name === selected)) setSelected(filtered[0].name);
    if (!filtered.length) setSelected("");
  }, [filtered, selected]);

  const columns: Array<DataTableColumn<VehicleStockLine>> = [
    {
      id: "item",
      header: "Article",
      sortValue: (line) => line.itemName || line.itemCode,
      cell: (line) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{line.itemName || line.itemCode}</p>
          <p className="truncate t-meta text-subtle">{line.itemCode}</p>
        </div>
      ),
    },
    {
      id: "uom",
      header: "Unité",
      width: "120px",
      hideBelow: "sm",
      sortValue: (line) => line.uom || "",
      cell: (line) => <span className="text-muted-foreground">{line.uom || "—"}</span>,
    },
    {
      id: "quantity",
      header: "Quantité",
      width: "120px",
      align: "right",
      numeric: true,
      sortValue: (line) => line.quantity,
      cell: (line) => <span className="font-semibold">{formatQuantity(line.quantity)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Stock physique"
        title="Stock des véhicules"
        description="Quantités réellement présentes dans l’entrepôt de chaque camion, actualisées toutes les 10 secondes."
        actions={
          <Button variant="outline" onClick={() => void mutate()} disabled={isLoading}>
            {isLoading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
            Actualiser
          </Button>
        }
      />

      <label className="block">
        <span className="sr-only">Rechercher un véhicule</span>
        <span className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un véhicule, une plaque ou un entrepôt…" className="pl-9" />
        </span>
      </label>

      {error && (
        <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          {apiErrorMessage(error)}
        </p>
      )}

      {isLoading && !vehicles.length && (
        <div className="grid min-h-48 place-items-center">
          <LoaderCircle className="size-7 animate-spin text-brand-600" />
        </div>
      )}

      {!isLoading && vehicles.length === 0 && (
        <div className="rounded-lg border border-dashed border-hairline-strong bg-card">
          <EmptyState
            icon={Truck}
            title="Aucun véhicule"
            description="Créez un véhicule pour suivre son stock camion."
          />
        </div>
      )}

      {vehicles.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
          <section className="space-y-2">
            {filtered.map((row) => {
              const active = row.name === selected;
              return (
                <button
                  key={row.name}
                  type="button"
                  onClick={() => setSelected(row.name)}
                  aria-pressed={active}
                  className={`w-full rounded-lg border p-4 text-left shadow-card transition-colors ${active ? "border-brand-300 bg-brand-50" : "border-hairline bg-card hover:border-hairline-strong"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="t-section text-foreground">{row.label}</p>
                      <p className="t-meta text-muted-foreground">{row.warehouse || "Entrepôt manquant"}{row.status ? ` · ${row.status}` : ""}</p>
                    </div>
                    <Package className={`size-5 shrink-0 ${active ? "text-brand-600" : "text-slate-400"}`} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
                    <span className="num rounded-full bg-surface-subtle px-2.5 py-1 text-slate-700">{formatQuantity(row.totalQuantity)} art.</span>
                    <span className="num rounded-full bg-surface-subtle px-2.5 py-1 text-slate-700">{row.itemCount} ligne{row.itemCount > 1 ? "s" : ""}</span>
                    {row.activeRoutes[0] && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">{row.activeRoutes[0].routeId}</span>}
                  </div>
                </button>
              );
            })}
            {!filtered.length && (
              <p className="rounded-lg border border-dashed border-hairline-strong bg-card p-4 t-body text-muted-foreground">
                Aucun véhicule ne correspond à la recherche.
              </p>
            )}
          </section>

          <Card className="p-4 sm:p-5">
            {!vehicle && <p className="t-body text-muted-foreground">Sélectionnez un véhicule pour voir son stock.</p>}
            {vehicle && (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="t-section">{vehicle.label}</h2>
                    <p className="t-body text-muted-foreground">{vehicle.warehouse || "Aucun entrepôt n’est associé à ce véhicule."}</p>
                  </div>
                  {vehicle.activeRoutes[0] && (
                    <p className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
                      {vehicle.activeRoutes[0].routeId} · {vehicle.activeRoutes[0].lifecycle}
                      {vehicle.activeRoutes[0].driverName ? ` · ${vehicle.activeRoutes[0].driverName}` : ""}
                    </p>
                  )}
                </div>
                {vehicle.missingWarehouse && (
                  <p role="status" className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    L’entrepôt camion n’est pas encore créé. Le stock physique restera vide tant qu’il n’existe pas.
                  </p>
                )}
                <label className="block">
                  <span className="sr-only">Filtrer les articles</span>
                  <Input value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} placeholder="Filtrer un article…" />
                </label>
                {!vehicle.lines.length && !vehicle.missingWarehouse && (
                  <div className="rounded-md border border-dashed border-hairline-strong">
                    <EmptyState
                      icon={Package}
                      title="Véhicule vide"
                      description="Aucun article n’est actuellement dans cet entrepôt."
                    />
                  </div>
                )}
                {vehicle.lines.length > 0 && (
                  <DataTable
                    label={`Stock du véhicule ${vehicle.label}`}
                    columns={columns}
                    rows={lines}
                    rowKey={(line) => `${line.itemCode}-${line.uom || ""}`}
                    maxHeight="max-h-[55vh]"
                    empty={
                      <p className="py-8 text-center t-body text-muted-foreground">
                        Aucun article ne correspond au filtre.
                      </p>
                    }
                  />
                )}
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

export default VehicleStockPage;
