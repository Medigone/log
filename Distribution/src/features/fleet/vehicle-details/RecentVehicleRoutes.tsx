import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { ROUTE_PREVIEW_LIMIT } from "@/features/fleet/vehicle-details/vehicleDetailsModel";
import { routeLifecycleTone } from "@/shared/design/statusTone";
import { formatShortDate } from "@/shared/format";
import type { FleetRouteSummary } from "@/shared/types/distribution";

const columns: Array<DataTableColumn<FleetRouteSummary>> = [
  {
    id: "name",
    header: "Tournée",
    sortValue: (row) => row.name,
    cell: (row) => (
      <Link to={`/planning/routes/${encodeURIComponent(row.name)}`} className="num font-medium hover:underline">
        {row.name}
      </Link>
    ),
  },
  {
    id: "date",
    header: "Date",
    width: "120px",
    sortValue: (row) => row.date || "",
    cell: (row) => <span className="num">{formatShortDate(row.date || undefined)}</span>,
  },
  {
    id: "driver",
    header: "Chauffeur",
    hideBelow: "sm",
    sortValue: (row) => row.driverName || "",
    cell: (row) => <span>{row.driverName || "Non renseigné"}</span>,
  },
  {
    id: "lifecycle",
    header: "Statut",
    sortValue: (row) => row.lifecycle || "",
    cell: (row) => (
      <StatusBadge tone={routeLifecycleTone(row.lifecycle || "")} size="sm">
        {row.lifecycle || "Non renseigné"}
      </StatusBadge>
    ),
  },
];

export function RecentVehicleRoutes({
  routes,
  onSeeAll,
}: {
  routes: FleetRouteSummary[];
  onSeeAll: () => void;
}) {
  const preview = routes.slice(0, ROUTE_PREVIEW_LIMIT);
  const empty = <p className="py-4 text-center text-sm text-muted-foreground">Aucune tournée enregistrée pour ce véhicule.</p>;

  return (
    <Card size="sm" className="h-full gap-0 pt-2">
      <CardHeader className="items-center border-b !pb-1.5">
        <CardTitle>Dernières tournées</CardTitle>
        {routes.length ? (
          <CardAction>
            <Button size="xs" variant="outline" onClick={onSeeAll}>
              Voir toutes les tournées
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>
      <CardContent className="flex-1 px-0 pb-0">
        <ul className="flex flex-col gap-0 md:hidden">
          {preview.length === 0
            ? empty
            : preview.map((row) => (
                <li key={row.name} className="flex items-start justify-between gap-3 border-t px-4 py-3 first:border-t-0">
                  <div className="min-w-0">
                    <Link to={`/planning/routes/${encodeURIComponent(row.name)}`} className="num font-medium hover:underline">
                      {row.name}
                    </Link>
                    <p className="text-sm text-muted-foreground">
                      {formatShortDate(row.date || undefined)}
                      {row.driverName ? ` · ${row.driverName}` : ""}
                    </p>
                  </div>
                  <StatusBadge tone={routeLifecycleTone(row.lifecycle || "")} size="sm">
                    {row.lifecycle || "Non renseigné"}
                  </StatusBadge>
                </li>
              ))}
        </ul>
        <div className="hidden md:block">
          <DataTable
            className="rounded-none border-0"
            label="Dernières tournées du véhicule"
            columns={columns}
            rows={preview}
            rowKey={(row) => row.name}
            rowTone={(row) => routeLifecycleTone(row.lifecycle || "")}
            empty={empty}
          />
        </div>
      </CardContent>
    </Card>
  );
}
