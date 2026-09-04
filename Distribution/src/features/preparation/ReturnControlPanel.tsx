import { useMemo, useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { AlertTriangle, Check, ClipboardCheck, LoaderCircle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import type { DataGridFeatures } from "@/components/reui/data-grid/data-grid";
import { apiErrorMessage, useDistributionMutations, useReturnRoutes } from "@/shared/api/distribution";
import type { DistributionRoute, RouteLoadLine } from "@/shared/types/distribution";
import { formatQuantity } from "@/shared/format";
import { NestedItemsGrid, PreparationSubTableGrid, namedHeader } from "@/features/preparation/PreparationSubTableGrid";

function isoDate(offsetDays = 0) {
  const value = new Date();
  value.setDate(value.getDate() + offsetDays);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

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

function remainingLines(route: DistributionRoute) {
  return (route.stock.lines || []).filter((line) => line.remainingQuantity > 0);
}

function ReturnItemsPanel({
  route,
  onUpdated,
}: {
  route: DistributionRoute;
  onUpdated: () => Promise<unknown>;
}) {
  const actions = useDistributionMutations();
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canConfirm = route.stock.status === "Retour déclaré";
  const lines = remainingLines(route);
  const allCounted = lines.every((line) => counts[line.name] !== "" && counts[line.name] != null);

  const confirm = async () => {
    setError("");
    setNotice("");
    try {
      const result = await actions.confirmRouteReturn({
        routeId: route.name,
        expectedRevision: route.revision,
        requestId: crypto.randomUUID(),
        lines: lines.map((line) => ({ lineName: line.name, quantity: Number(counts[line.name]) })),
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
      accessorFn: (row) => row.itemName || row.itemCode,
      ...namedHeader("Article"),
      cell: ({ row }) => (
        <span className="truncate whitespace-nowrap">{row.original.itemName || row.original.itemCode || "—"}</span>
      ),
      size: 180,
    },
    {
      id: "code",
      accessorKey: "itemCode",
      ...namedHeader("Code"),
      cell: ({ row }) => (
        <span className="truncate whitespace-nowrap text-muted-foreground">{row.original.itemCode || "—"}</span>
      ),
      size: 110,
    },
    {
      id: "deliveryNote",
      accessorKey: "deliveryNote",
      ...namedHeader("BL"),
      cell: ({ row }) => <span className="truncate whitespace-nowrap">{row.original.deliveryNote || "—"}</span>,
      size: 130,
    },
    {
      id: "batch",
      accessorFn: (row) => row.batchNo || "",
      ...namedHeader("Lot"),
      cell: ({ row }) => <span className="truncate whitespace-nowrap">{row.original.batchNo || "—"}</span>,
      size: 110,
    },
    {
      id: "expected",
      accessorKey: "remainingQuantity",
      ...namedHeader("Attendu"),
      cell: ({ row }) => (
        <span className="num tabular-nums">
          {formatQuantity(row.original.remainingQuantity)}
          {row.original.uom ? ` ${row.original.uom}` : ""}
        </span>
      ),
      size: 110,
    },
    {
      id: "counted",
      header: "Compté",
      cell: ({ row }) => (
        <Input
          aria-label={`Quantité comptée ${row.original.itemCode}`}
          type="number"
          min="0"
          step="any"
          placeholder="Quantité comptée"
          disabled={!canConfirm}
          value={counts[row.original.name] ?? ""}
          onChange={(event) => setCounts((current) => ({ ...current, [row.original.name]: event.target.value }))}
        />
      ),
      size: 160,
      enableSorting: false,
    },
  ];

  return (
    <div className="flex flex-col gap-3 bg-muted/50 p-3">
      {!canConfirm && (
        <p className="rounded-lg bg-background p-3 text-sm text-muted-foreground">
          Le livreur doit d’abord déclarer son retour depuis son interface mobile.
        </p>
      )}
      {canConfirm && (
        <p className="text-sm text-muted-foreground">
          Comptez physiquement chaque ligne. Le transfert vers l’entrepôt de retour n’est créé que si tout correspond.
        </p>
      )}
      <NestedItemsGrid
        columns={columns}
        rows={lines}
        getRowId={(row) => row.name}
        empty="Aucune marchandise restante pour cette tournée."
        label={`Articles à retourner ${route.name}`}
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
          disabled={actions.fulfillment || (!allCounted && lines.length > 0)}
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
  const { routes, error, isLoading, mutate } = usePendingReturnRoutes();

  const columns: Array<ColumnDef<DataGridFeatures, DistributionRoute>> = [
    {
      id: "name",
      accessorKey: "name",
      ...namedHeader("Tournée"),
      cell: ({ row }) => <span className="truncate font-medium">{row.original.name}</span>,
      size: 150,
      enableHiding: false,
    },
    {
      id: "driver",
      accessorFn: (row) => row.driverName || row.driver || "",
      ...namedHeader("Livreur"),
      cell: ({ row }) => (
        <span className="truncate">{row.original.driverName || row.original.driver || "Livreur"}</span>
      ),
      size: 140,
    },
    {
      id: "vehicle",
      accessorFn: (row) => row.vehicleLabel || row.vehicle || "",
      ...namedHeader("Véhicule"),
      cell: ({ row }) => (
        <span className="truncate">{row.original.vehicleLabel || row.original.vehicle || "Véhicule"}</span>
      ),
      size: 140,
    },
    {
      id: "remaining",
      accessorFn: (row) => row.stock.remainingQuantity,
      ...namedHeader("À retourner"),
      cell: ({ row }) => (
        <span className="num whitespace-nowrap tabular-nums font-semibold">{row.original.stock.remainingQuantity}</span>
      ),
      size: 110,
    },
    {
      id: "status",
      accessorFn: (row) => row.stock.status,
      ...namedHeader("Statut"),
      cell: ({ row }) => (
        <StatusBadge tone={row.original.stock.status === "Retour déclaré" ? "warning" : "neutral"} size="sm">
          {row.original.stock.status}
        </StatusBadge>
      ),
      size: 150,
    },
  ];

  return (
    <section className="flex flex-col gap-4" aria-labelledby="return-control-title">
      <div>
        <h2 id="return-control-title" className="font-semibold text-foreground">Retours à contrôler</h2>
        <p className="text-sm text-muted-foreground">Recomptage et retour du véhicule vers l’entrepôt. Indépendant du contrôle de caisse.</p>
      </div>
      {error ? <p role="alert" className="text-sm text-red-700">{apiErrorMessage(error)}</p> : null}
      <PreparationSubTableGrid
        label="Retours à contrôler"
        columns={columns}
        rows={routes}
        getRowId={(row) => row.name}
        expandContent={(row) => <ReturnItemsPanel route={row} onUpdated={mutate} />}
        canExpand={() => true}
        isLoading={isLoading && !routes.length}
        empty={
          <div className="rounded-lg border border-dashed border-hairline-strong bg-card">
            <EmptyState
              icon={RotateCcw}
              title="Aucun retour à traiter"
              description="Les tournées avec un reliquat à ramener apparaîtront ici après la déclaration du livreur."
            />
          </div>
        }
      />
    </section>
  );
}
