import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, CalendarPlus, ClipboardPlus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AssignDialog } from "@/features/fleet/AssignDialog";
import { AssignmentHistoryTable } from "@/features/fleet/AssignmentHistoryTable";
import { DocumentCard } from "@/features/fleet/DocumentCard";
import { EntretienDialog } from "@/features/fleet/EntretienDialog";
import { VehicleFormDialog } from "@/features/fleet/VehicleFormDialog";
import { readFileAsDataUrl, vehicleDisplayName } from "@/features/fleet/fleetHelpers";
import { AssignedDriverCard } from "@/features/fleet/vehicle-details/AssignedDriverCard";
import { MaintenanceCard } from "@/features/fleet/vehicle-details/MaintenanceCard";
import { RecentVehicleRoutes } from "@/features/fleet/vehicle-details/RecentVehicleRoutes";
import { VehicleDocumentsSummary } from "@/features/fleet/vehicle-details/VehicleDocumentsSummary";
import { VehicleHeader } from "@/features/fleet/vehicle-details/VehicleHeader";
import { VehicleOperationalSummary } from "@/features/fleet/vehicle-details/VehicleOperationalSummary";
import { BreadcrumbLabel } from "@/layouts/ConsoleBreadcrumb";
import { apiErrorMessage, useFleetMutations, useFleetOptions, useFleetVehicle } from "@/shared/api/distribution";
import { entretienStatusTone, routeLifecycleTone } from "@/shared/design/statusTone";
import { formatQuantity, formatShortDate } from "@/shared/format";
import type { FleetEntretien, FleetRouteSummary } from "@/shared/types/distribution";

type VehicleTab = "overview" | "chauffeur" | "documents" | "entretiens" | "tournees" | "historique";
type EntretienIntent = "plan" | "record";

export function VehicleDetailsPage({ canWrite = false }: { canWrite?: boolean }) {
  const { vehicleId } = useParams();
  const navigate = useNavigate();
  const name = vehicleId ? decodeURIComponent(vehicleId) : "";
  const { data, error, isLoading, mutate } = useFleetVehicle(name || undefined);
  const { data: optionsData, mutate: refreshOptions } = useFleetOptions();
  const actions = useFleetMutations();
  const vehicle = data?.message;
  const options = optionsData?.message;
  const [tab, setTab] = useState<VehicleTab>("overview");
  const [assignOpen, setAssignOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [entretienOpen, setEntretienOpen] = useState(false);
  const [entretienIntent, setEntretienIntent] = useState<EntretienIntent>("plan");
  const [errorMessage, setErrorMessage] = useState("");

  const openEntretien = (intent: EntretienIntent) => {
    setEntretienIntent(intent);
    setEntretienOpen(true);
  };

  const saveStatus = async (next: string) => {
    if (!vehicle || !canWrite || next === vehicle.status) return;
    try {
      await actions.updateVehicle({ name: vehicle.name, status: next });
      toast.success("Statut mis à jour.");
      await mutate();
    } catch (submitError) {
      setErrorMessage(apiErrorMessage(submitError));
    }
  };

  const toggleActive = async () => {
    if (!vehicle || !canWrite) return;
    try {
      await actions.updateVehicle({ name: vehicle.name, active: !vehicle.active });
      toast.success(vehicle.active ? "Véhicule désactivé." : "Véhicule activé.");
      await mutate();
    } catch (submitError) {
      setErrorMessage(apiErrorMessage(submitError));
    }
  };

  const routeColumns: Array<DataTableColumn<FleetRouteSummary>> = [
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

  const entretienColumns: Array<DataTableColumn<FleetEntretien>> = [
    {
      id: "date",
      header: "Date",
      sortValue: (row) => row.date || "",
      cell: (row) => <span className="num">{formatShortDate(row.date || undefined)}</span>,
    },
    {
      id: "type",
      header: "Type",
      sortValue: (row) => row.type || "",
      cell: (row) => <span>{row.type || "Non renseigné"}</span>,
    },
    {
      id: "status",
      header: "Statut",
      sortValue: (row) => row.status || "",
      cell: (row) => (
        <StatusBadge tone={entretienStatusTone(row.status || "")} size="sm">
          {row.status || "Non renseigné"}
        </StatusBadge>
      ),
    },
    {
      id: "km",
      header: "Km",
      align: "right",
      numeric: true,
      sortValue: (row) => row.km || 0,
      cell: (row) => <span className="num">{row.km ? formatQuantity(row.km) : "Non renseigné"}</span>,
    },
  ];

  if (isLoading && !vehicle) {
    return (
      <div className="flex flex-col gap-4" aria-hidden="true">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-xl" />
      </div>
    );
  }

  if (error || !vehicle) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Véhicule introuvable"
        description={error ? apiErrorMessage(error) : "Cette fiche n’existe pas."}
        action={
          <Button variant="outline" onClick={() => navigate("/vehicules")}>
            <ArrowLeft data-icon="inline-start" />
            Retour à la liste
          </Button>
        }
      />
    );
  }

  const entretienActions = canWrite ? (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" variant="outline" onClick={() => openEntretien("plan")}>
        <CalendarPlus data-icon="inline-start" />
        Planifier
      </Button>
      <Button size="sm" onClick={() => openEntretien("record")}>
        <ClipboardPlus data-icon="inline-start" />
        Enregistrer l’entretien
      </Button>
    </div>
  ) : null;

  return (
    <>
      <BreadcrumbLabel>{vehicleDisplayName(vehicle)}</BreadcrumbLabel>
      <VehicleHeader
        vehicle={vehicle}
        canWrite={canWrite}
        isLoading={isLoading}
        saving={actions.saving}
        onRefresh={() => void mutate()}
        onToggleActive={toggleActive}
        onOpenStock={() => navigate("/stock")}
        onEdit={
          canWrite
            ? () => {
                setErrorMessage("");
                setEditOpen(true);
              }
            : undefined
        }
        onStatusChange={canWrite ? saveStatus : undefined}
        onUploadImage={
          canWrite
            ? async (file) => {
                try {
                  const content = await readFileAsDataUrl(file);
                  await actions.uploadDocument({
                    doctype: "Vehicule",
                    name: vehicle.name,
                    field: "image",
                    filename: file.name,
                    content,
                  });
                  toast.success("Photo du véhicule enregistrée.");
                  await mutate();
                } catch (submitError) {
                  setErrorMessage(apiErrorMessage(submitError));
                }
              }
            : undefined
        }
      />

      {errorMessage && !editOpen && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Impossible d’enregistrer</AlertTitle>
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as VehicleTab)}
        aria-label="Sections du véhicule"
        className="gap-4"
      >
        <TabsList variant="line" className="max-w-full flex-nowrap overflow-x-auto">
          <TabsTrigger value="overview" className="after:bg-primary">
            Vue d’ensemble
          </TabsTrigger>
          <TabsTrigger value="chauffeur" className="after:bg-primary">
            Chauffeur
          </TabsTrigger>
          <TabsTrigger value="documents" className="after:bg-primary">
            Documents
          </TabsTrigger>
          <TabsTrigger value="entretiens" className="after:bg-primary">
            Entretiens
          </TabsTrigger>
          <TabsTrigger value="tournees" className="after:bg-primary">
            Tournées
          </TabsTrigger>
          <TabsTrigger value="historique" className="after:bg-primary">
            Historique
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="pt-4">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
              <div className="order-1 flex h-full flex-col gap-4 xl:col-span-8">
                <VehicleOperationalSummary vehicle={vehicle} className="flex-1" />
                <AssignedDriverCard vehicle={vehicle} canWrite={canWrite} onAssign={() => setAssignOpen(true)} />
              </div>
              <div className="order-2 xl:col-span-4">
                <MaintenanceCard
                  vehicle={vehicle}
                  canWrite={canWrite}
                  onPlan={() => openEntretien("plan")}
                  onRecord={() => openEntretien("record")}
                  className="h-full"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
              <div className="order-2 xl:order-1 xl:col-span-8">
                <RecentVehicleRoutes routes={vehicle.recentRoutes || []} onSeeAll={() => setTab("tournees")} />
              </div>
              <div className="order-1 xl:order-2 xl:col-span-4">
                <VehicleDocumentsSummary documents={vehicle.documents || []} onOpen={() => setTab("documents")} />
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="chauffeur" className="flex flex-col gap-4 pt-4">
          <AssignedDriverCard vehicle={vehicle} canWrite={canWrite} onAssign={() => setAssignOpen(true)} />
        </TabsContent>

        <TabsContent value="documents" className="pt-4">
          <div className="grid gap-4 md:grid-cols-2">
            {(vehicle.documents || []).map((document) => (
              <DocumentCard
                key={document.key}
                document={document}
                canWrite={canWrite}
                saving={actions.saving}
                onUpload={async (file, expiry) => {
                  const content = await readFileAsDataUrl(file);
                  await actions.uploadDocument({
                    doctype: "Vehicule",
                    name: vehicle.name,
                    field: document.key,
                    filename: file.name,
                    content,
                    expiry: expiry || null,
                  });
                  toast.success(`${document.label} enregistré.`);
                  await mutate();
                }}
              />
            ))}
          </div>
        </TabsContent>

        <TabsContent value="entretiens" className="flex flex-col gap-4 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-medium text-foreground">Historique d’entretien</h2>
              <p className="text-sm text-muted-foreground">
                Dernier : {formatShortDate(vehicle.lastMaintenance || undefined)} · Prochain :{" "}
                {formatShortDate(vehicle.nextMaintenance || undefined)}
              </p>
            </div>
            {entretienActions}
          </div>
          <DataTable
            label={`Entretiens de ${vehicle.label}`}
            columns={entretienColumns}
            rows={vehicle.entretiens || []}
            rowKey={(row) => row.name}
            empty={<p className="py-8 text-center text-sm text-muted-foreground">Aucun entretien enregistré.</p>}
          />
        </TabsContent>

        <TabsContent value="tournees" className="pt-4">
          <DataTable
            label={`Tournées de ${vehicle.label}`}
            columns={routeColumns}
            rows={vehicle.recentRoutes || []}
            rowKey={(row) => row.name}
            rowTone={(row) => routeLifecycleTone(row.lifecycle || "")}
            empty={<p className="py-8 text-center text-sm text-muted-foreground">Aucune tournée enregistrée pour ce véhicule.</p>}
          />
        </TabsContent>

        <TabsContent value="historique" className="pt-4">
          <AssignmentHistoryTable
            label={`Affectations de ${vehicle.label}`}
            rows={vehicle.assignmentHistory || []}
          />
        </TabsContent>
      </Tabs>

      <VehicleFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        vehicle={vehicle}
        companies={options?.companies || []}
        saving={actions.saving}
        error={errorMessage}
        onSubmit={async (payload) => {
          try {
            await actions.updateVehicle({ ...payload, name: vehicle.name });
            toast.success("Véhicule mis à jour.");
            setErrorMessage("");
            setEditOpen(false);
            await Promise.all([mutate(), refreshOptions()]);
          } catch (submitError) {
            setErrorMessage(apiErrorMessage(submitError));
          }
        }}
      />

      <AssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        title="Assigner un chauffeur"
        description="L’affectation est unique : l’ancien véhicule et l’ancien chauffeur sont libérés."
        label="Livreur"
        mode="driver"
        options={options?.drivers || []}
        value={vehicle.driver || ""}
        emptyLabel="Aucun chauffeur"
        saving={actions.saving}
        onSubmit={async (next, reason) => {
          await actions.assignVehicleDriver(vehicle.name, next || null, reason);
          toast.success(next ? "Chauffeur assigné." : "Chauffeur retiré.");
          await Promise.all([mutate(), refreshOptions()]);
        }}
      />

      <EntretienDialog
        open={entretienOpen}
        onOpenChange={setEntretienOpen}
        vehicle={vehicle.name}
        vehicleKm={vehicle.km}
        intent={entretienIntent}
        saving={actions.saving}
        onSubmit={async (payload) => {
          await actions.createEntretien(payload);
          toast.success(payload.status === "Terminé" ? "Entretien enregistré." : "Entretien planifié.");
          await mutate();
        }}
      />
    </>
  );
}

export default VehicleDetailsPage;
