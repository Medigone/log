import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, LoaderCircle, Package, RefreshCw, Search, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiErrorMessage, useVehicleStocks } from "@/shared/api/distribution";

function formatQty(value: number) {
  return new Intl.NumberFormat("fr-DZ", { maximumFractionDigits: 3 }).format(value);
}

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

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-bold text-blue-700">Stock physique</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Stock des véhicules</h1>
          <p className="mt-1 text-sm text-slate-500">Quantités réellement présentes dans l’entrepôt de chaque camion, actualisées toutes les 10 secondes.</p>
        </div>
        <Button variant="outline" onClick={() => void mutate()} disabled={isLoading} className="h-11 w-full sm:w-auto">
          {isLoading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
          Actualiser
        </Button>
      </header>

      <label className="block">
        <span className="sr-only">Rechercher un véhicule</span>
        <span className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher un véhicule, une plaque ou un entrepôt…" className="h-11 pl-9" />
        </span>
      </label>

      {error && <p role="alert" className="flex gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertTriangle className="h-4 w-4 shrink-0" />{apiErrorMessage(error)}</p>}

      {isLoading && !vehicles.length && <div className="grid min-h-48 place-items-center"><LoaderCircle className="h-7 w-7 animate-spin text-blue-700" /></div>}

      {!isLoading && vehicles.length === 0 && (
        <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white text-center">
          <div>
            <Truck className="mx-auto h-10 w-10 text-slate-400" />
            <p className="mt-3 font-bold">Aucun véhicule</p>
            <p className="text-sm text-slate-500">Créez un véhicule pour suivre son stock camion.</p>
          </div>
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
                  className={`w-full rounded-2xl border p-4 text-left transition-colors ${active ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-bold text-slate-950">{row.label}</p>
                      <p className="text-xs text-slate-500">{row.warehouse || "Entrepôt manquant"}{row.status ? ` · ${row.status}` : ""}</p>
                    </div>
                    <Package className={`h-5 w-5 shrink-0 ${active ? "text-blue-700" : "text-slate-400"}`} />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{formatQty(row.totalQuantity)} art.</span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-slate-700">{row.itemCount} ligne{row.itemCount > 1 ? "s" : ""}</span>
                    {row.activeRoutes[0] && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-amber-800">{row.activeRoutes[0].routeId}</span>}
                  </div>
                </button>
              );
            })}
            {!filtered.length && <p className="rounded-xl border border-dashed border-slate-300 bg-white p-4 text-sm text-slate-500">Aucun véhicule ne correspond à la recherche.</p>}
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            {!vehicle && <p className="text-sm text-slate-500">Sélectionnez un véhicule pour voir son stock.</p>}
            {vehicle && (
              <div className="space-y-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="font-bold">{vehicle.label}</h2>
                    <p className="text-sm text-slate-500">{vehicle.warehouse || "Aucun entrepôt n’est associé à ce véhicule."}</p>
                  </div>
                  {vehicle.activeRoutes[0] && (
                    <p className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800">
                      {vehicle.activeRoutes[0].routeId} · {vehicle.activeRoutes[0].lifecycle}
                      {vehicle.activeRoutes[0].driverName ? ` · ${vehicle.activeRoutes[0].driverName}` : ""}
                    </p>
                  )}
                </div>
                {vehicle.missingWarehouse && (
                  <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                    L’entrepôt camion n’est pas encore créé. Le stock physique restera vide tant qu’il n’existe pas.
                  </p>
                )}
                <label className="block">
                  <span className="sr-only">Filtrer les articles</span>
                  <Input value={itemSearch} onChange={(event) => setItemSearch(event.target.value)} placeholder="Filtrer un article…" />
                </label>
                {!vehicle.lines.length && !vehicle.missingWarehouse && (
                  <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-slate-200 text-center">
                    <div>
                      <Package className="mx-auto h-8 w-8 text-slate-300" />
                      <p className="mt-2 font-bold text-slate-700">Véhicule vide</p>
                      <p className="text-sm text-slate-500">Aucun article n’est actuellement dans cet entrepôt.</p>
                    </div>
                  </div>
                )}
                {lines.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="text-xs font-bold uppercase tracking-wide text-slate-400">
                        <tr>
                          <th className="pb-2 pr-4">Article</th>
                          <th className="pb-2 pr-4">Unité</th>
                          <th className="pb-2 text-right">Quantité</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line) => (
                          <tr key={`${line.itemCode}-${line.uom || ""}`} className="border-t border-slate-100">
                            <td className="py-3 pr-4">
                              <p className="font-semibold text-slate-900">{line.itemName || line.itemCode}</p>
                              <p className="text-xs text-slate-400">{line.itemCode}</p>
                            </td>
                            <td className="py-3 pr-4 text-slate-500">{line.uom || "—"}</td>
                            <td className="py-3 text-right font-bold">{formatQty(line.quantity)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {vehicle.lines.length > 0 && !lines.length && <p className="text-sm text-slate-500">Aucun article ne correspond au filtre.</p>}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default VehicleStockPage;
