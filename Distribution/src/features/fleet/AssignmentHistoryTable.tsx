import { Link } from "react-router-dom";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/status-badge";
import { assignmentActionTone } from "@/shared/design/statusTone";
import { formatDateTime } from "@/shared/format";
import type { FleetAssignmentHistory } from "@/shared/types/distribution";

function EntityCell({
  name,
  label,
  to,
}: {
  name?: string | null;
  label?: string | null;
  to?: string;
}) {
  if (!name && !label) return <span className="t-body text-muted-foreground">—</span>;
  const text = label || name || "—";
  if (name && to) {
    return (
      <Link to={to} className="t-body text-brand-700 hover:underline">
        {text}
      </Link>
    );
  }
  return <span className="t-body">{text}</span>;
}

export function AssignmentHistoryTable({
  rows,
  label,
}: {
  rows: FleetAssignmentHistory[];
  label: string;
}) {
  const columns: Array<DataTableColumn<FleetAssignmentHistory>> = [
    {
      id: "at",
      header: "Date",
      width: "160px",
      sortValue: (row) => row.at || "",
      cell: (row) => <span className="num t-body">{formatDateTime(row.at || undefined)}</span>,
    },
    {
      id: "action",
      header: "Action",
      width: "140px",
      sortValue: (row) => row.action || "",
      cell: (row) => (
        <StatusBadge tone={assignmentActionTone(row.action)} size="sm">
          {row.action || "—"}
        </StatusBadge>
      ),
    },
    {
      id: "driver",
      header: "Livreur",
      sortValue: (row) => row.driverLabel || row.driver || "",
      cell: (row) => (
        <EntityCell
          name={row.driver}
          label={row.driverLabel}
          to={row.driver ? `/livreurs/${encodeURIComponent(row.driver)}` : undefined}
        />
      ),
    },
    {
      id: "vehicle",
      header: "Véhicule",
      hideBelow: "md",
      sortValue: (row) => row.vehicleLabel || row.vehicle || "",
      cell: (row) => (
        <EntityCell
          name={row.vehicle}
          label={row.vehicleLabel}
          to={row.vehicle ? `/vehicules/${encodeURIComponent(row.vehicle)}` : undefined}
        />
      ),
    },
    {
      id: "user",
      header: "Utilisateur",
      hideBelow: "lg",
      sortValue: (row) => row.userLabel || row.user || "",
      cell: (row) => <span className="t-body">{row.userLabel || row.user || "—"}</span>,
    },
    {
      id: "reason",
      header: "Motif",
      hideBelow: "xl",
      sortValue: (row) => row.reason || "",
      cell: (row) => <span className="t-body text-muted-foreground">{row.reason || "—"}</span>,
    },
  ];

  return (
    <DataTable
      label={label}
      columns={columns}
      rows={rows}
      rowKey={(row) => row.name}
      empty={<p className="py-8 text-center t-body text-muted-foreground">Aucun historique d’affectation.</p>}
    />
  );
}
