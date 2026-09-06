import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Check, ClipboardCheck, LoaderCircle, RotateCcw } from "lucide-react";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { FilterSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { ReturnMetricsTiles } from "@/features/preparation/ReturnsEmptyState";
import {
  PreparationMoreFilters,
  PreparationQueueShell,
  preparationChipClass,
} from "@/features/preparation/PreparationQueueShell";
import { Input } from "@/components/ui/input";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import type { DataGridFeatures } from "@/components/reui/data-grid/data-grid";
import {
  apiErrorMessage,
  useDistributionMutations,
  useReturnHistory,
  useReturnMetrics,
  useReturnRoutes,
} from "@/shared/api/distribution";
import type { DistributionRoute, ReturnHistoryRow, RouteLoadLine } from "@/shared/types/distribution";
import { formatQuantity } from "@/shared/format";
import { NestedItemsGrid, PreparationSubTableGrid, namedHeader } from "@/features/preparation/PreparationSubTableGrid";
import { preparationReturnColumns, returnCustomerLabel } from "@/features/preparation/preparationReturnColumns";

type ReturnChip = "all" | "pending" | "confirmed" | "exceptions";

function isoDate(offsetDays = 0) {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

const DEFAULT_FROM = () => isoDate(-30);
const DEFAULT_TO = () => isoDate(0);

export function hasGoodsToReturn(route: Pick<DistributionRoute, "stock">) {
  return (route.stock?.remainingQuantity || 0) > 0;
}

export function usePendingReturnRoutes() {
  const { data, error, isLoading, mutate } = useReturnRoutes(isoDate(-30), isoDate(7));
  const routes = useMemo(
    () => (data?.message || []).filter(hasGoodsToReturn),
    [data?.message],
  );
  return { routes, error, isLoading, mutate };
}

function remainingLines(row: ReturnHistoryRow) {
  return (row.lines || []).filter((line) => line.remainingQuantity > 0);
}

function ReturnItemsPanel({
  row,
  onUpdated,
}: {
  row: ReturnHistoryRow;
  onUpdated: () => Promise<unknown>;
}) {
  const actions = useDistributionMutations();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canConfirm = row.status === "Retour déclaré";
  const pending = remainingLines(row);
  const allCounted = pending.every((line) => counts[line.name] !== "" && counts[line.name] != null);
  const lines = row.lines || [];

  const confirm = async () => {
    setError("");
    setNotice("");
    try {
      const result = await actions.confirmRouteReturn({
        routeId: row.name,
        expectedRevision: row.revision,
        requestId: crypto.randomUUID(),
        lines: pending.map((line) => ({ lineName: line.name, quantity: Number(counts[line.name]) })),
      });
      if (!result.success) {
        setError("Le comptage ne correspond pas au stock attendu. Une exception Responsable a été créée.");
      } else {
        setNotice(`Retour confirmé · Stock Entry ${result.route.stock.returnStockEntry || "créé"}.`);
        await onUpdated();
      }
    } catch (confirmationError) {
      setError(apiErrorMessage(confirmationError));
    }
  };

  const columns: Array<ColumnDef<DataGridFeatures, RouteLoadLine>> = [
    {
      id: "item",
      accessorFn: (line) => line.itemName || line.itemCode,
      ...namedHeader("Article"),
      cell: ({ row: tableRow }) => (
        <span className="truncate whitespace-nowrap">{tableRow.original.itemName || tableRow.original.itemCode || "—"}</span>
      ),
      size: 160,
    },
    {
      id: "code",
      accessorKey: "itemCode",
      ...namedHeader("Code"),
      cell: ({ row: tableRow }) => (
        <span className="truncate whitespace-nowrap text-muted-foreground">{tableRow.original.itemCode || "—"}</span>
      ),
      size: 100,
    },
    {
      id: "customer",
      accessorFn: (line) => line.customerName || line.customer || "",
      ...namedHeader("Client"),
      cell: ({ row: tableRow }) => (
        <span className="truncate whitespace-nowrap">{tableRow.original.customerName || tableRow.original.customer || "—"}</span>
      ),
      size: 140,
    },
    {
      id: "deliveryNote",
      accessorKey: "deliveryNote",
      ...namedHeader("BL"),
      cell: ({ row: tableRow }) => <span className="truncate whitespace-nowrap">{tableRow.original.deliveryNote || "—"}</span>,
      size: 120,
    },
    {
      id: "batch",
      accessorFn: (line) => line.batchNo || "",
      ...namedHeader("Lot"),
      cell: ({ row: tableRow }) => <span className="truncate whitespace-nowrap">{tableRow.original.batchNo || "—"}</span>,
      size: 100,
    },
    {
      id: "loaded",
      accessorKey: "loadedQuantity",
      ...namedHeader("Chargé"),
      cell: ({ row: tableRow }) => (
        <span className="num tabular-nums">{formatQuantity(tableRow.original.loadedQuantity)}</span>
      ),
      size: 88,
    },
    {
      id: "delivered",
      accessorKey: "deliveredQuantity",
      ...namedHeader("Livré"),
      cell: ({ row: tableRow }) => (
        <span className="num tabular-nums">{formatQuantity(tableRow.original.deliveredQuantity)}</span>
      ),
      size: 88,
    },
    {
      id: "returned",
      accessorKey: "returnedQuantity",
      ...namedHeader("Retourné"),
      cell: ({ row: tableRow }) => (
        <span className="num tabular-nums">{formatQuantity(tableRow.original.returnedQuantity)}</span>
      ),
      size: 96,
    },
    {
      id: "remaining",
      accessorKey: "remainingQuantity",
      ...namedHeader("Restant"),
      cell: ({ row: tableRow }) => (
        <span className="num tabular-nums">
          {formatQuantity(tableRow.original.remainingQuantity)}
          {tableRow.original.uom ? ` ${tableRow.original.uom}` : ""}
        </span>
      ),
      size: 110,
    },
    ...(canConfirm
      ? [
          {
            id: "counted",
            header: "Compté",
            cell: ({ row: tableRow }: { row: { original: RouteLoadLine } }) =>
              tableRow.original.remainingQuantity > 0 ? (
                <Input
                  aria-label={`Quantité comptée ${tableRow.original.itemCode}`}
                  type="number"
                  min="0"
                  step="any"
                  placeholder="Quantité comptée"
                  value={counts[tableRow.original.name] ?? ""}
                  onChange={(event) =>
                    setCounts((current) => ({ ...current, [tableRow.original.name]: event.target.value }))
                  }
                />
              ) : (
                <span className="text-muted-foreground">—</span>
              ),
            size: 160,
            enableSorting: false,
          } as ColumnDef<DataGridFeatures, RouteLoadLine>,
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-3 bg-muted/50 p-3">
      {canConfirm ? (
        <p className="text-sm text-muted-foreground">
          Comptez physiquement chaque ligne. Le transfert vers l’entrepôt de retour n’est créé que si tout correspond.
        </p>
      ) : row.status === "Retour requis" ? (
        <p className="rounded-lg bg-background p-3 text-sm text-muted-foreground">
          Le livreur doit d’abord déclarer son retour depuis son interface mobile.
        </p>
      ) : null}
      <NestedItemsGrid
        columns={columns}
        rows={lines}
        getRowId={(line) => line.name}
        empty="Aucun article pour cette tournée."
        label={`Articles à retourner ${row.name}`}
        className="p-0"
      />
      {error && (
        <p role="alert" className="flex gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="flex gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">
          <Check className="size-4 shrink-0" />
          {notice}
        </p>
      )}
      {canConfirm ? (
        <Button
          onClick={() => void confirm()}
          disabled={actions.fulfillment || (!allCounted && pending.length > 0)}
          className="w-full sm:w-auto"
        >
          {actions.fulfillment ? <LoaderCircle data-icon="inline-start" className="animate-spin" /> : <ClipboardCheck data-icon="inline-start" />}
          Confirmer le retour complet
        </Button>
      ) : null}
    </div>
  );
}

export function ReturnControlPanel() {
  const [search, setSearch] = useState("");
  const [chip, setChip] = useState<ReturnChip>("all");
  const [driver, setDriver] = useState("");
  const [vehicle, setVehicle] = useState("");
  const [customer, setCustomer] = useState("");
  const [dateFrom, setDateFrom] = useState(DEFAULT_FROM);
  const [dateTo, setDateTo] = useState(DEFAULT_TO);
  const apiFrom = dateFrom || DEFAULT_FROM();
  const apiTo = dateTo || DEFAULT_TO();
  const { data, error, isLoading, mutate } = useReturnHistory(apiFrom, apiTo);
  const { data: metricsData } = useReturnMetrics();
  const metrics = metricsData?.message;
  const rows = data?.message || [];

  const drivers = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => row.driverName || row.driver).filter(Boolean) as string[])).sort((a, b) =>
        a.localeCompare(b, "fr"),
      ),
    [rows],
  );
  const vehicles = useMemo(
    () =>
      Array.from(new Set(rows.map((row) => row.vehicleLabel || row.vehicle).filter(Boolean) as string[])).sort((a, b) =>
        a.localeCompare(b, "fr"),
      ),
    [rows],
  );
  const customers = useMemo(
    () =>
      Array.from(
        new Set(
          rows.flatMap((row) => row.customers || []).map((item) => item.customerName || item.name).filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b, "fr")),
    [rows],
  );

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr");
    return rows.filter((row) => {
      if (chip === "pending" && !(row.remainingQuantity > 0)) return false;
      if (chip === "confirmed" && row.status !== "Retourné") return false;
      if (chip === "exceptions" && row.status !== "Exception") return false;
      const driverLabel = row.driverName || row.driver || "";
      const vehicleLabel = row.vehicleLabel || row.vehicle || "";
      if (driver && driverLabel !== driver) return false;
      if (vehicle && vehicleLabel !== vehicle) return false;
      if (customer && !(row.customers || []).some((item) => (item.customerName || item.name) === customer)) {
        return false;
      }
      if (!query) return true;
      const haystack = [
        row.name,
        driverLabel,
        vehicleLabel,
        returnCustomerLabel(row),
        ...(row.lines || []).flatMap((line) => [line.itemCode, line.itemName, line.deliveryNote]),
      ];
      return haystack.filter(Boolean).some((value) => String(value).toLocaleLowerCase("fr").includes(query));
    });
  }, [chip, customer, driver, rows, search, vehicle]);

  const defaultFrom = DEFAULT_FROM();
  const defaultTo = DEFAULT_TO();
  const filtersActive = Boolean(
    search || chip !== "all" || driver || vehicle || customer || dateFrom !== defaultFrom || dateTo !== defaultTo,
  );
  const resetFilters = () => {
    setSearch("");
    setChip("all");
    setDriver("");
    setVehicle("");
    setCustomer("");
    setDateFrom(defaultFrom);
    setDateTo(defaultTo);
  };

  const toggleChip = (value: ReturnChip) => {
    setChip((current) => (current === value ? "all" : value));
  };

  const columns = useMemo(() => preparationReturnColumns(), []);

  return (
    <section className="flex flex-col gap-5" aria-labelledby="return-control-title">
      {error ? <p role="alert" className="text-sm text-red-700">{apiErrorMessage(error)}</p> : null}
      <ReturnMetricsTiles metrics={metrics} />
      <PreparationQueueShell
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Tournée, client, livreur, véhicule, article…"
        searchAriaLabel="Rechercher un retour"
        chips={
          <>
            <button type="button" className={preparationChipClass(chip === "pending")} onClick={() => toggleChip("pending")}>
              <span className="size-1.5 rounded-full bg-[#d97706]" /> À contrôler
            </button>
            <button
              type="button"
              className={preparationChipClass(chip === "confirmed")}
              onClick={() => toggleChip("confirmed")}
            >
              <span className="size-1.5 rounded-full bg-emerald-600" /> Confirmés
            </button>
            <button
              type="button"
              className={preparationChipClass(chip === "exceptions")}
              onClick={() => toggleChip("exceptions")}
            >
              <span className="size-1.5 rounded-full bg-destructive" /> Écarts
            </button>
          </>
        }
        moreFilters={
          <PreparationMoreFilters>
            <FilterSelect
              label="Client"
              value={customer || "all"}
              onChange={(value) => setCustomer(value === "all" ? "" : value)}
              options={[{ value: "all", label: "Tous" }, ...customers.map((value) => ({ value, label: value }))]}
            />
            <FilterSelect
              label="Livreur"
              value={driver || "all"}
              onChange={(value) => setDriver(value === "all" ? "" : value)}
              options={[{ value: "all", label: "Tous" }, ...drivers.map((value) => ({ value, label: value }))]}
            />
            <FilterSelect
              label="Véhicule"
              value={vehicle || "all"}
              onChange={(value) => setVehicle(value === "all" ? "" : value)}
              options={[{ value: "all", label: "Tous" }, ...vehicles.map((value) => ({ value, label: value }))]}
            />
            <DateRangeFilter
              from={dateFrom}
              to={dateTo}
              onChange={(range) => {
                setDateFrom(range.from);
                setDateTo(range.to);
              }}
            />
          </PreparationMoreFilters>
        }
        countLabel={`${filtered.length} / ${rows.length} retours`}
        heading={
          <>
            <h2 id="return-control-title" className="sr-only">
              Historique des retours
            </h2>
            <p className="sr-only">
              Recomptage et retour du véhicule vers l’entrepôt. Indépendant du contrôle de caisse.
            </p>
          </>
        }
        filtersActive={filtersActive}
        onReset={resetFilters}
      >
        {isLoading && !rows.length ? (
          <Skeleton className="h-72 w-full rounded-none" aria-hidden="true" />
        ) : !filtered.length ? (
          <div className="p-4">
            <Empty className="border border-dashed">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <ClipboardCheck />
                </EmptyMedia>
                <EmptyTitle>{rows.length ? "Aucun retour ne correspond" : "Aucun retour"}</EmptyTitle>
                <EmptyDescription>
                  {rows.length
                    ? "Modifiez ou réinitialisez les filtres."
                    : "Les retours déclarés et confirmés resteront listés ici, avec le client, le livreur, le véhicule et les articles."}
                </EmptyDescription>
              </EmptyHeader>
              {rows.length ? (
                <EmptyContent>
                  <Button variant="outline" size="sm" onClick={resetFilters}>
                    <RotateCcw data-icon="inline-start" />
                    Réinitialiser
                  </Button>
                </EmptyContent>
              ) : null}
            </Empty>
          </div>
        ) : (
          <PreparationSubTableGrid
            label="Historique des retours"
            columns={columns}
            rows={filtered}
            getRowId={(row) => row.name}
            expandContent={(row) => <ReturnItemsPanel row={row} onUpdated={mutate} />}
            canExpand={(row) => (row.lines?.length ?? 0) > 0 || row.remainingQuantity > 0}
            isLoading={isLoading && !rows.length}
          />
        )}
      </PreparationQueueShell>
    </section>
  );
}
