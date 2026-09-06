import type { ColumnDef } from "@tanstack/react-table";
import type { DataGridFeatures } from "@/components/reui/data-grid/data-grid";
import { StatusBadge } from "@/components/ui/status-badge";
import { namedHeader } from "@/features/preparation/PreparationSubTableGrid";
import { formatQuantity, formatShortDate } from "@/shared/format";
import type { ReturnHistoryRow } from "@/shared/types/distribution";

export function returnCustomerLabel(row: ReturnHistoryRow) {
  return (row.customers || [])
    .map((customer) => customer.customerName || customer.name)
    .filter(Boolean)
    .join(", ");
}

export function returnStatusTone(status: string) {
  if (status === "Retour déclaré") return "warning" as const;
  if (status === "Exception") return "danger" as const;
  if (status === "Retourné") return "success" as const;
  return "neutral" as const;
}

export function preparationReturnColumns(): Array<ColumnDef<DataGridFeatures, ReturnHistoryRow>> {
  return [
    {
      id: "date",
      accessorFn: (row) => row.confirmedAt || row.date,
      ...namedHeader("Date"),
      cell: ({ row }) => (
        <div className="flex min-w-0 flex-col">
          <span className="num whitespace-nowrap text-[12.5px]">{formatShortDate(row.original.date)}</span>
          {row.original.confirmedAt ? (
            <span className="truncate text-[11px] text-muted-foreground">
              Confirmé {formatShortDate(row.original.confirmedAt)}
            </span>
          ) : null}
        </div>
      ),
      size: 118,
    },
    {
      id: "route",
      accessorKey: "name",
      ...namedHeader("Tournée · Client"),
      cell: ({ row }) => (
        <div className="flex min-w-0 flex-col">
          <span className="num truncate text-[12.5px] font-medium">{row.original.name}</span>
          <span className="truncate text-[11px] text-muted-foreground">
            {returnCustomerLabel(row.original) || "—"}
          </span>
        </div>
      ),
      size: 220,
      enableHiding: false,
    },
    {
      id: "driver",
      accessorFn: (row) => row.driverName || row.driver || "",
      ...namedHeader("Livreur"),
      cell: ({ row }) => (
        <span className="truncate text-[13px]">{row.original.driverName || row.original.driver || "—"}</span>
      ),
      size: 140,
    },
    {
      id: "vehicle",
      accessorFn: (row) => row.vehicleLabel || row.vehicle || "",
      ...namedHeader("Véhicule"),
      cell: ({ row }) => (
        <span className="truncate text-[13px]">{row.original.vehicleLabel || row.original.vehicle || "—"}</span>
      ),
      size: 140,
    },
    {
      id: "quantity",
      accessorFn: (row) => (row.remainingQuantity > 0 ? row.remainingQuantity : row.returnedQuantity),
      ...namedHeader("Quantité"),
      cell: ({ row }) => {
        const remaining = row.original.remainingQuantity;
        const returned = row.original.returnedQuantity;
        if (remaining > 0) {
          return (
            <span className="num whitespace-nowrap text-[12.5px] font-medium">
              {formatQuantity(remaining)} à retourner
            </span>
          );
        }
        return (
          <span className="num whitespace-nowrap text-[12.5px]">{formatQuantity(returned)} retournés</span>
        );
      },
      size: 140,
    },
    {
      id: "status",
      accessorFn: (row) => row.status,
      ...namedHeader("Statut"),
      cell: ({ row }) => (
        <StatusBadge tone={returnStatusTone(row.original.status)} size="sm">
          {row.original.status}
        </StatusBadge>
      ),
      size: 150,
    },
  ];
}
