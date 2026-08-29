import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  Car,
  Eye,
  FileWarning,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  UserRound,
  Wrench,
} from "lucide-react";
import { FilterSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { TableRowActions } from "@/components/ui/table-row-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { KpiTile } from "@/components/ui/kpi-tile";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Toolbar } from "@/components/ui/toolbar";
import { AssignDialog } from "@/features/fleet/AssignDialog";
import { VehicleFormDialog } from "@/features/fleet/VehicleFormDialog";
import { documentAlertLabel, matchesQuery } from "@/features/fleet/fleetHelpers";
import { apiErrorMessage, useFleetMutations, useFleetOptions, useFleetVehicles } from "@/shared/api/distribution";
import { documentAlertTone, vehicleStatusTone } from "@/shared/design/statusTone";
import { formatShortDate } from "@/shared/format";
import type { FleetVehicle, FleetVehicleInput } from "@/shared/types/distribution";

type VehicleFocus = "all" | "available" | "maintenance" | "outOfService" | "withoutDriver" | "documents" | "entretien";

function vehicleDocumentAlert(row: FleetVehicle) {
  const alerts = row.documents.map((doc) => doc.alert).filter(Boolean);
  if (alerts.includes("expired")) return "expired";
  if (alerts.includes("expiring")) return "expiring";
  return null;
}

function matchesFocus(row: FleetVehicle, focus: VehicleFocus) {
  if (focus === "available") return row.status === "Disponible" && row.active;
  if (focus === "maintenance") return row.status === "En maintenance";
  if (focus === "outOfService") return row.status === "Hors service";
  if (focus === "withoutDriver") return row.active && !row.driver;
  if (focus === "documents") return vehicleDocumentAlert(row) === "expired" || vehicleDocumentAlert(row) === "expiring";
  if (focus === "entretien") return row.maintenanceAlert === "due" || row.maintenanceAlert === "upcoming";
  return true;
}

export function VehiclesPage({ canWrite = false }: { canWrite?: boolean }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [focus, setFocus] = useState<VehicleFocus>("all");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<FleetVehicle | null>(null);
  const [assigning, setAssigning] = useState<FleetVehicle | null>(null);
  const [error, setError] = useState("");
  const { data, error: listError, isLoading, mutate } = useFleetVehicles();
  const { data: optionsData, mutate: refreshOptions } = useFleetOptions();
  const actions = useFleetMutations();
  const board = data?.message;
  const vehicles = board?.vehicles || [];
  const kpis = board?.kpis;
  const options = optionsData?.message;
  const query = search.trim().toLocaleLowerCase("fr");

  const filtered = useMemo(
    () =>
      vehicles.filter(
        (row) =>
          matchesFocus(row, focus) &&
          matchesQuery([row.label, row.name, row.registration, row.driverName, row.company, row.status], query),
      ),
    [focus, query, vehicles],
  );

  const openCreate = () => {
    setEditing(null);
    setError("");
    setFormOpen(true);
  };

  const openEdit = (row: FleetVehicle) => {
    setEditing(row);
    setError("");
    setFormOpen(true);
  };

  const saveVehicle = async (payload: FleetVehicleInput) => {
    setError("");
    try {
      if (editing) {
        await actions.updateVehicle({ ...payload, name: editing.name });
        toast.success("Véhicule mis à jour.");
      } else {
        const created = await actions.createVehicle(payload);
        toast.success("Véhicule créé. L’entrepôt a été préparé.");
        setFormOpen(false);
        await Promise.all([mutate(), refreshOptions()]);
        navigate(`/vehicules/${encodeURIComponent(created.name)}`);
        return;
      }
      setFormOpen(false);
      setEditing(null);
      await Promise.all([mutate(), refreshOptions()]);
    } catch (submitError) {
      setError(apiErrorMessage(submitError));
    }
  };

  const columns: Array<DataTableColumn<FleetVehicle>> = [
    {
      id: "name",
      header: "Véhicule",
      sortValue: (row) => row.label,
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-foreground">{row.label}</p>
          <p className="num mt-0.5 truncate t-meta text-muted-foreground">{row.registration || row.name}</p>
        </div>
      ),
    },
    {
      id: "status",
      header: "Statut",
      width: "160px",
      sortValue: (row) => row.status,
      cell: (row) => (
        <StatusBadge tone={vehicleStatusTone(row.status, row.active)} size="sm">
          {row.active ? row.status : "Désactivé"}
        </StatusBadge>
      ),
    },
    {
      id: "driver",
      header: "Chauffeur",
      hideBelow: "md",
      sortValue: (row) => row.driverName || "",
      cell: (row) => <span className="t-body">{row.driverName || "—"}</span>,
    },
    {
      id: "docs",
      header: "Documents",
      hideBelow: "lg",
      sortValue: (row) => vehicleDocumentAlert(row) || "",
      cell: (row) => {
        const alert = vehicleDocumentAlert(row);
        return (
          <StatusBadge tone={documentAlertTone(alert)} size="sm">
            {alert ? documentAlertLabel(alert) : "À jour"}
          </StatusBadge>
        );
      },
    },
    {
      id: "entretien",
      header: "Entretien",
      hideBelow: "xl",
      sortValue: (row) => row.nextMaintenance || "",
      cell: (row) => (
        <span className="num t-body">{row.nextMaintenance ? formatShortDate(row.nextMaintenance) : "—"}</span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      width: "88px",
      align: "right",
      cell: (row) => (
        <TableRowActions label={`Actions de ${row.label}`}>
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => navigate(`/vehicules/${encodeURIComponent(row.name)}`)}>
              <Eye />
              Ouvrir
            </DropdownMenuItem>
            {canWrite && (
              <DropdownMenuItem onClick={() => openEdit(row)}>
                <Pencil />
                Modifier
              </DropdownMenuItem>
            )}
            {canWrite && (
              <DropdownMenuItem onClick={() => setAssigning(row)}>
                <UserRound />
                Assigner
              </DropdownMenuItem>
            )}
          </DropdownMenuGroup>
        </TableRowActions>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Flotte"
        title="Véhicules"
        description="Parc, documents, entretien et chauffeur principal."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void mutate()} disabled={isLoading}>
              {isLoading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
              Actualiser
            </Button>
            {canWrite && (
              <Button onClick={openCreate}>
                <Plus />
                Nouveau véhicule
              </Button>
            )}
          </div>
        }
      />

      <section aria-label="Indicateurs des véhicules" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          icon={Car}
          tone="success"
          label="Disponibles"
          value={isLoading && !kpis ? "—" : kpis?.available ?? 0}
          hint={`${kpis?.total ?? 0} fiches →`}
          onClick={() => setFocus("available")}
          className={focus === "available" ? "border-brand-300 bg-brand-50/50" : undefined}
        />
        <KpiTile
          icon={UserRound}
          tone={kpis?.withoutDriver ? "warning" : "neutral"}
          label="Sans chauffeur"
          value={isLoading && !kpis ? "—" : kpis?.withoutDriver ?? 0}
          hint="À affecter →"
          onClick={() => setFocus("withoutDriver")}
          className={focus === "withoutDriver" ? "border-brand-300 bg-brand-50/50" : undefined}
        />
        <KpiTile
          icon={FileWarning}
          tone={kpis?.documentAlerts ? "danger" : "neutral"}
          label="Docs à surveiller"
          value={isLoading && !kpis ? "—" : kpis?.documentAlerts ?? 0}
          hint="Assurance ou CT →"
          onClick={() => setFocus("documents")}
          className={focus === "documents" ? "border-brand-300 bg-brand-50/50" : undefined}
        />
        <KpiTile
          icon={Wrench}
          tone={kpis?.maintenanceDue ? "warning" : "neutral"}
          label="Entretien dû"
          value={isLoading && !kpis ? "—" : kpis?.maintenanceDue ?? 0}
          hint="Prochaine échéance →"
          onClick={() => setFocus("entretien")}
          className={focus === "entretien" ? "border-brand-300 bg-brand-50/50" : undefined}
        />
      </section>

      <Toolbar>
        <InputGroup className="min-w-48 flex-1 bg-background">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Nom, immatriculation ou chauffeur…"
            aria-label="Rechercher un véhicule"
          />
        </InputGroup>
        <FilterSelect
          label="État"
          value={focus}
          onChange={(value) => setFocus(value as VehicleFocus)}
          options={[
            { value: "all", label: "Tous" },
            { value: "available", label: "Disponibles" },
            { value: "maintenance", label: "En maintenance" },
            { value: "outOfService", label: "Hors service" },
            { value: "withoutDriver", label: "Sans chauffeur" },
            { value: "documents", label: "Documents à surveiller" },
            { value: "entretien", label: "Entretien dû" },
          ]}
        />
      </Toolbar>

      {listError && (
        <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          {apiErrorMessage(listError)}
        </p>
      )}

      {isLoading && !vehicles.length ? (
        <Skeleton className="h-72 w-full rounded-lg" aria-hidden="true" />
      ) : (
        <DataTable
          label="Liste des véhicules"
          columns={columns}
          rows={filtered}
          rowKey={(row) => row.name}
          onRowClick={(row) => navigate(`/vehicules/${encodeURIComponent(row.name)}`)}
          empty={
            <EmptyState
              icon={Car}
              title={vehicles.length ? "Aucun véhicule ne correspond." : "Aucun véhicule"}
              description={canWrite ? "Créez une fiche pour ouvrir un entrepôt de tournée." : "Aucune fiche véhicule pour l’instant."}
              action={
                canWrite && !vehicles.length ? (
                  <Button onClick={openCreate}>
                    <Plus />
                    Nouveau véhicule
                  </Button>
                ) : undefined
              }
            />
          }
        />
      )}

      <VehicleFormDialog
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) {
            setEditing(null);
            setError("");
          }
        }}
        mode={editing ? "edit" : "create"}
        vehicle={editing}
        companies={options?.companies || []}
        drivers={options?.drivers || []}
        defaultCompany={options?.companies[0]?.name}
        saving={actions.saving}
        error={error}
        onSubmit={saveVehicle}
      />

      {assigning && (
        <AssignDialog
          open={Boolean(assigning)}
          onOpenChange={(open) => {
            if (!open) setAssigning(null);
          }}
          title={`Chauffeur de ${assigning.label}`}
          description="L’affectation est unique : l’ancien véhicule et l’ancien chauffeur sont libérés."
          label="Livreur"
          mode="driver"
          options={options?.drivers || []}
          value={assigning.driver || ""}
          emptyLabel="Aucun chauffeur"
          saving={actions.saving}
          onSubmit={async (next, reason) => {
            await actions.assignVehicleDriver(assigning.name, next || null, reason);
            toast.success(next ? "Chauffeur assigné." : "Chauffeur retiré.");
            await Promise.all([mutate(), refreshOptions()]);
            setAssigning(null);
          }}
        />
      )}
    </>
  );
}

export default VehiclesPage;
