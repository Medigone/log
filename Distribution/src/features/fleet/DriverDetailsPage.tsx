import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  Car,
  LoaderCircle,
  MapPin,
  RefreshCw,
  Route,
  Wallet,
} from "lucide-react";
import { FormSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiTile } from "@/components/ui/kpi-tile";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { AssignDialog } from "@/features/fleet/AssignDialog";
import { AssignmentHistoryTable } from "@/features/fleet/AssignmentHistoryTable";
import { DocumentCard } from "@/features/fleet/DocumentCard";
import { readFileAsDataUrl } from "@/features/fleet/fleetHelpers";
import { apiErrorMessage, useFleetDriver, useFleetMutations, useFleetOptions } from "@/shared/api/distribution";
import { cashBalanceTone, driverStatusTone, routeLifecycleTone, vehicleStatusTone } from "@/shared/design/statusTone";
import { formatMoney, formatShortDate } from "@/shared/format";
import type { FleetRouteSummary } from "@/shared/types/distribution";

export function DriverDetailsPage({ canWrite = false }: { canWrite?: boolean }) {
  const { driverId } = useParams();
  const navigate = useNavigate();
  const name = driverId ? decodeURIComponent(driverId) : "";
  const { data, error, isLoading, mutate } = useFleetDriver(name || undefined);
  const { data: optionsData, mutate: refreshOptions } = useFleetOptions();
  const actions = useFleetMutations();
  const driver = data?.message;
  const options = optionsData?.message;
  const dashboard = driver?.dashboard;
  const [assignOpen, setAssignOpen] = useState(false);
  const [status, setStatus] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const currentStatus = status || driver?.status || "Actif";

  const saveStatus = async (next: string) => {
    if (!driver || !canWrite) return;
    setStatus(next);
    try {
      await actions.updateDriver({ name: driver.name, status: next });
      toast.success("Statut mis à jour.");
      await mutate();
    } catch (submitError) {
      setErrorMessage(apiErrorMessage(submitError));
    }
  };

  const toggleActive = async () => {
    if (!driver || !canWrite) return;
    try {
      await actions.updateDriver({ name: driver.name, active: !driver.active });
      toast.success(driver.active ? "Livreur désactivé." : "Livreur activé.");
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
        <Link to={`/planning/routes/${encodeURIComponent(row.name)}`} className="num font-medium text-brand-700 hover:underline">
          {row.name}
        </Link>
      ),
    },
    {
      id: "date",
      header: "Date",
      width: "120px",
      sortValue: (row) => row.date || "",
      cell: (row) => <span className="num t-body">{formatShortDate(row.date || undefined)}</span>,
    },
    {
      id: "lifecycle",
      header: "État",
      sortValue: (row) => row.lifecycle || "",
      cell: (row) => (
        <StatusBadge tone={routeLifecycleTone(row.lifecycle || "")} size="sm">
          {row.lifecycle || "—"}
        </StatusBadge>
      ),
    },
    {
      id: "vehicle",
      header: "Véhicule",
      hideBelow: "md",
      sortValue: (row) => row.vehicleLabel || "",
      cell: (row) => <span className="t-body">{row.vehicleLabel || "—"}</span>,
    },
  ];

  if (isLoading && !driver) {
    return (
      <div className="space-y-4" aria-hidden="true">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (error || !driver) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Livreur introuvable"
        description={error ? apiErrorMessage(error) : "Cette fiche n’existe pas."}
        action={
          <Button variant="outline" onClick={() => navigate("/livreurs")}>
            <ArrowLeft />
            Retour aux livreurs
          </Button>
        }
      />
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Flotte"
        title={driver.label}
        description={driver.userEmail || driver.user || driver.name}
        meta={
          <StatusBadge tone={driverStatusTone(driver.status, driver.active)}>
            {driver.active ? driver.status : "Désactivé"}
          </StatusBadge>
        }
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => navigate("/livreurs")}>
              <ArrowLeft />
              Liste
            </Button>
            <Button variant="outline" onClick={() => void mutate()} disabled={isLoading}>
              {isLoading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
              Actualiser
            </Button>
            {canWrite && (
              <Button variant="outline" onClick={() => void toggleActive()} disabled={actions.saving}>
                {driver.active ? "Désactiver" : "Activer"}
              </Button>
            )}
          </div>
        }
      />

      {errorMessage && (
        <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          {errorMessage}
        </p>
      )}

      <section aria-label="Indicateurs du livreur" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={Route} tone="info" label="Tournées du jour" value={dashboard?.kpis.plannedRoutes ?? 0} />
        <KpiTile icon={MapPin} tone="success" label="Arrêts livrés" value={dashboard?.kpis.deliveredStops ?? 0} hint={`${dashboard?.kpis.failedStops ?? 0} non livrés`} />
        <KpiTile icon={Wallet} tone="info" label="Encaissé" value={formatMoney(dashboard?.kpis.amountCollected ?? 0, { precise: true })} />
        <KpiTile
          icon={Wallet}
          tone={cashBalanceTone(driver.cashBalance)}
          label="Solde caisse"
          value={formatMoney(driver.cashBalance, { precise: true })}
        />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader className="border-b">
            <div className="flex items-start justify-between gap-3">
              <CardTitle>Véhicule</CardTitle>
              {canWrite && (
                <Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>
                  <Car />
                  {driver.vehicle ? "Changer" : "Assigner"}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2 pt-4">
            {driver.vehicle ? (
              <>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Link to={`/vehicules/${encodeURIComponent(driver.vehicle)}`} className="t-section text-brand-700 hover:underline">
                    {driver.vehicleLabel || driver.vehicle}
                  </Link>
                  {driver.vehicleStatus ? (
                    <StatusBadge tone={vehicleStatusTone(driver.vehicleStatus, driver.vehicleActive ?? true)} size="sm">
                      {driver.vehicleActive === false ? "Désactivé" : driver.vehicleStatus}
                    </StatusBadge>
                  ) : null}
                </div>
                <p className="t-meta text-muted-foreground">{driver.vehicle}</p>
              </>
            ) : (
              <p className="t-body text-muted-foreground">Aucun véhicule assigné.</p>
            )}
            {canWrite && (
              <label className="mt-3 flex max-w-xs flex-col gap-1.5">
                <span className="t-micro text-muted-foreground">Statut</span>
                <FormSelect
                  aria-label="Statut"
                  value={currentStatus}
                  onChange={(value) => void saveStatus(value)}
                  options={[
                    { value: "Actif", label: "Actif" },
                    { value: "En congé", label: "En congé" },
                    { value: "Indisponible", label: "Indisponible" },
                  ]}
                />
              </label>
            )}
          </CardContent>
        </Card>

        <DocumentCard
          document={driver.license}
          canWrite={canWrite}
          saving={actions.saving}
          onUpload={async (file, expiry) => {
            const content = await readFileAsDataUrl(file);
            await actions.uploadDocument({
              doctype: "Livreur",
              name: driver.name,
              field: "permis",
              filename: file.name,
              content,
              expiry: expiry || null,
            });
            toast.success("Permis enregistré.");
            await mutate();
          }}
        />
      </div>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="t-section">Tournées récentes</h2>
          <Button variant="outline" size="sm" onClick={() => navigate("/caisses")}>
            <Wallet />
            Caisse livreur
          </Button>
        </div>
        <DataTable
          label={`Tournées de ${driver.label}`}
          columns={routeColumns}
          rows={driver.recentRoutes || []}
          rowKey={(row) => row.name}
          rowTone={(row) => routeLifecycleTone(row.lifecycle || "")}
          empty={<p className="py-8 text-center t-body text-muted-foreground">Aucune tournée récente.</p>}
        />
      </section>

      <section className="space-y-3">
        <h2 className="t-section">Historique d’affectation</h2>
        <AssignmentHistoryTable
          label={`Affectations de ${driver.label}`}
          rows={driver.assignmentHistory || []}
        />
      </section>

      <AssignDialog
        open={assignOpen}
        onOpenChange={setAssignOpen}
        title="Assigner un véhicule"
        description="L’affectation est unique : l’ancien véhicule et l’ancien chauffeur sont libérés."
        label="Véhicule"
        mode="vehicle"
        options={options?.vehicles || []}
        value={driver.vehicle || ""}
        emptyLabel="Aucun véhicule"
        saving={actions.saving}
        onSubmit={async (next, reason) => {
          await actions.assignDriverVehicle(driver.name, next || null, reason);
          toast.success(next ? "Véhicule assigné." : "Véhicule retiré.");
          await Promise.all([mutate(), refreshOptions()]);
        }}
      />
    </>
  );
}

export default DriverDetailsPage;
