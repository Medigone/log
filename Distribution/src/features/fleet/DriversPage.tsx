import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  Car,
  Eye,
  FileWarning,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  UserRound,
  Wallet,
} from "lucide-react";
import { FilterSelect, FormSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import {
  DropdownMenuGroup,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { TableRowActions } from "@/components/ui/table-row-actions";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { KpiTile } from "@/components/ui/kpi-tile";
import { Money } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Toolbar } from "@/components/ui/toolbar";
import { AssignDialog } from "@/features/fleet/AssignDialog";
import { fleetOptionLabel, licenseLabel, matchesQuery } from "@/features/fleet/fleetHelpers";
import { VehicleLabel } from "@/features/fleet/VehicleLabel";
import { apiErrorMessage, useFleetDrivers, useFleetMutations, useFleetOptions } from "@/shared/api/distribution";
import { documentAlertTone, driverStatusTone } from "@/shared/design/statusTone";
import type { FleetDriver } from "@/shared/types/distribution";

type DriverFocus = "all" | "active" | "onLeave" | "unavailable" | "withoutVehicle" | "license" | "cash";
type CreateMode = "new" | "existing";

const MIN_PASSWORD_LENGTH = 8;

function matchesFocus(row: FleetDriver, focus: DriverFocus) {
  if (focus === "active") return row.status === "Actif" && row.active;
  if (focus === "onLeave") return row.status === "En congé";
  if (focus === "unavailable") return row.status === "Indisponible";
  if (focus === "withoutVehicle") return row.active && !row.vehicle;
  if (focus === "license") return row.license.alert === "expired" || row.license.alert === "expiring";
  if (focus === "cash") return row.cashBalance > 0;
  return true;
}

export function DriversPage({ canWrite = false }: { canWrite?: boolean }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [focus, setFocus] = useState<DriverFocus>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [assigning, setAssigning] = useState<FleetDriver | null>(null);
  const [createMode, setCreateMode] = useState<CreateMode>("new");
  const [user, setUser] = useState("");
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [status, setStatus] = useState("Actif");
  const [vehicle, setVehicle] = useState("");
  const [error, setError] = useState("");
  const { data, error: listError, isLoading, mutate } = useFleetDrivers();
  const { data: optionsData, mutate: refreshOptions } = useFleetOptions();
  const actions = useFleetMutations();
  const board = data?.message;
  const drivers = board?.drivers || [];
  const kpis = board?.kpis;
  const options = optionsData?.message;
  const query = search.trim().toLocaleLowerCase("fr");

  const filtered = useMemo(
    () =>
      drivers.filter(
        (row) =>
          matchesFocus(row, focus) &&
          matchesQuery([row.label, row.name, row.user, row.vehicle, row.vehicleLabel, row.vehicleStatus, row.status], query),
      ),
    [drivers, focus, query],
  );

  const canCreate =
    createMode === "existing"
      ? Boolean(user)
      : Boolean(email.trim() && firstName.trim() && password.length >= MIN_PASSWORD_LENGTH && password === passwordConfirm);

  const openCreate = () => {
    setCreateMode("new");
    setUser("");
    setEmail("");
    setFirstName("");
    setLastName("");
    setPassword("");
    setPasswordConfirm("");
    setStatus("Actif");
    setVehicle("");
    setError("");
    setCreateOpen(true);
  };

  const create = async () => {
    if (!canCreate) return;
    setError("");
    try {
      const created = await actions.createDriver(
        createMode === "existing"
          ? { user, status, vehicle: vehicle || null }
          : {
              email: email.trim(),
              firstName: firstName.trim(),
              lastName: lastName.trim() || undefined,
              password,
              status,
              vehicle: vehicle || null,
            },
      );
      toast.success("Livreur créé.");
      setCreateOpen(false);
      await Promise.all([mutate(), refreshOptions()]);
      navigate(`/livreurs/${encodeURIComponent(created.name)}`);
    } catch (submitError) {
      setError(apiErrorMessage(submitError));
    }
  };

  const columns: Array<DataTableColumn<FleetDriver>> = [
    {
      id: "name",
      header: "Livreur",
      sortValue: (row) => row.label,
      cell: (row) => (
        <div className="min-w-0">
          <p className="font-medium text-foreground">{row.label}</p>
          <p className="num mt-0.5 truncate t-meta text-muted-foreground">{row.name}</p>
        </div>
      ),
    },
    {
      id: "status",
      header: "Statut",
      width: "140px",
      sortValue: (row) => row.status,
      cell: (row) => (
        <StatusBadge tone={driverStatusTone(row.status, row.active)} size="sm">
          {row.active ? row.status : "Désactivé"}
        </StatusBadge>
      ),
    },
    {
      id: "vehicle",
      header: "Véhicule",
      hideBelow: "md",
      sortValue: (row) => row.vehicleLabel || "",
      cell: (row) => (
        <VehicleLabel label={row.vehicleLabel} status={row.vehicleStatus} active={row.vehicleActive} />
      ),
    },
    {
      id: "license",
      header: "Permis",
      hideBelow: "lg",
      sortValue: (row) => row.license.alert || "",
      cell: (row) => (
        <StatusBadge tone={documentAlertTone(row.license.alert || (row.license.url ? "valid" : "missing"))} size="sm">
          {licenseLabel(row.license)}
        </StatusBadge>
      ),
    },
    {
      id: "cash",
      header: "Caisse",
      width: "140px",
      align: "right",
      numeric: true,
      sortValue: (row) => row.cashBalance,
      cell: (row) => <Money value={row.cashBalance} precise signed className={row.cashBalance > 0 ? "text-amber-700" : undefined} />,
    },
    {
      id: "actions",
      header: "Actions",
      width: "88px",
      align: "right",
      cell: (row) => (
        <TableRowActions label={`Actions de ${row.label}`}>
          <DropdownMenuGroup>
            <DropdownMenuItem onClick={() => navigate(`/livreurs/${encodeURIComponent(row.name)}`)}>
              <Eye />
              Ouvrir
            </DropdownMenuItem>
            {canWrite && (
              <DropdownMenuItem onClick={() => setAssigning(row)}>
                <Car />
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
        title="Livreurs"
        description="Tableau de bord des livreurs : affectation véhicule, permis et caisse."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void mutate()} disabled={isLoading}>
              {isLoading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
              Actualiser
            </Button>
            {canWrite && (
              <Button onClick={openCreate}>
                <Plus />
                Nouveau livreur
              </Button>
            )}
          </div>
        }
      />

      <section aria-label="Indicateurs des livreurs" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          icon={UserRound}
          tone="success"
          label="Actifs"
          value={isLoading && !kpis ? "—" : kpis?.active ?? 0}
          hint={`${kpis?.total ?? 0} fiches →`}
          onClick={() => setFocus("active")}
          className={focus === "active" ? "border-brand-300 bg-brand-50/50" : undefined}
        />
        <KpiTile
          icon={Car}
          tone={kpis?.withoutVehicle ? "warning" : "neutral"}
          label="Sans véhicule"
          value={isLoading && !kpis ? "—" : kpis?.withoutVehicle ?? 0}
          hint="À affecter →"
          onClick={() => setFocus("withoutVehicle")}
          className={focus === "withoutVehicle" ? "border-brand-300 bg-brand-50/50" : undefined}
        />
        <KpiTile
          icon={FileWarning}
          tone={kpis?.licenseAlerts ? "danger" : "neutral"}
          label="Permis à surveiller"
          value={isLoading && !kpis ? "—" : kpis?.licenseAlerts ?? 0}
          hint="Expiré ou bientôt →"
          onClick={() => setFocus("license")}
          className={focus === "license" ? "border-brand-300 bg-brand-50/50" : undefined}
        />
        <KpiTile
          icon={Wallet}
          tone={kpis?.cashToHandover ? "warning" : "neutral"}
          label="Caisses à remettre"
          value={isLoading && !kpis ? "—" : kpis?.cashToHandover ?? 0}
          hint="Solde positif →"
          onClick={() => setFocus("cash")}
          className={focus === "cash" ? "border-brand-300 bg-brand-50/50" : undefined}
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
            placeholder="Nom, véhicule ou code…"
            aria-label="Rechercher un livreur"
          />
        </InputGroup>
        <FilterSelect
          label="État"
          value={focus}
          onChange={(value) => setFocus(value as DriverFocus)}
          options={[
            { value: "all", label: "Tous" },
            { value: "active", label: "Actifs" },
            { value: "onLeave", label: "En congé" },
            { value: "unavailable", label: "Indisponibles" },
            { value: "withoutVehicle", label: "Sans véhicule" },
            { value: "license", label: "Permis à surveiller" },
            { value: "cash", label: "Caisse à remettre" },
          ]}
        />
      </Toolbar>

      {listError && (
        <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          {apiErrorMessage(listError)}
        </p>
      )}

      {isLoading && !drivers.length ? (
        <Skeleton className="h-72 w-full rounded-lg" aria-hidden="true" />
      ) : (
        <DataTable
          label="Liste des livreurs"
          columns={columns}
          rows={filtered}
          rowKey={(row) => row.name}
          onRowClick={(row) => navigate(`/livreurs/${encodeURIComponent(row.name)}`)}
          empty={
            <EmptyState
              icon={UserRound}
              title={drivers.length ? "Aucun livreur ne correspond." : "Aucun livreur"}
              description={canWrite ? "Créez un compte et une fiche depuis ce tableau." : "Aucune fiche livreur pour l’instant."}
              action={
                canWrite && !drivers.length ? (
                  <Button onClick={openCreate}>
                    <Plus />
                    Nouveau livreur
                  </Button>
                ) : undefined
              }
            />
          }
        />
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void create();
            }}
          >
            <DialogHeader>
              <DialogTitle>Nouveau livreur</DialogTitle>
              <DialogDescription>
                {createMode === "new"
                  ? "Le compte de connexion et la fiche livreur sont créés ensemble. La caisse s’ouvre automatiquement."
                  : "Liez un compte déjà créé avec le rôle Livreur. La caisse s’ouvre automatiquement."}
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-3">
              {error && (
                <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <AlertTriangle className="size-4 shrink-0" />
                  {error}
                </p>
              )}
              {createMode === "new" ? (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                      <span className="t-micro text-muted-foreground">Prénom</span>
                      <Input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" aria-label="Prénom" />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="t-micro text-muted-foreground">Nom</span>
                      <Input value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" aria-label="Nom" />
                    </label>
                  </div>
                  <label className="flex flex-col gap-1.5">
                    <span className="t-micro text-muted-foreground">E-mail</span>
                    <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="off" aria-label="E-mail" />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                      <span className="t-micro text-muted-foreground">Mot de passe</span>
                      <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" aria-label="Mot de passe" />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className="t-micro text-muted-foreground">Confirmation</span>
                      <Input type="password" value={passwordConfirm} onChange={(event) => setPasswordConfirm(event.target.value)} autoComplete="new-password" aria-label="Confirmation du mot de passe" />
                    </label>
                  </div>
                  {passwordConfirm && password !== passwordConfirm ? (
                    <p className="t-meta text-red-700">Les mots de passe ne correspondent pas.</p>
                  ) : (
                    <p className="t-meta text-muted-foreground">Au moins {MIN_PASSWORD_LENGTH} caractères.</p>
                  )}
                </>
              ) : (
                <label className="flex flex-col gap-1.5">
                  <span className="t-micro text-muted-foreground">Compte</span>
                  <FormSelect
                    aria-label="Compte"
                    value={user}
                    onChange={setUser}
                    options={[
                      { value: "", label: "Sélectionner un compte" },
                      ...(options?.users || []).map((option) => ({ value: option.name, label: option.label })),
                    ]}
                  />
                </label>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="t-micro text-muted-foreground">Statut</span>
                  <FormSelect
                    aria-label="Statut"
                    value={status}
                    onChange={setStatus}
                    options={[
                      { value: "Actif", label: "Actif" },
                      { value: "En congé", label: "En congé" },
                      { value: "Indisponible", label: "Indisponible" },
                    ]}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="t-micro text-muted-foreground">Véhicule</span>
                  <FormSelect
                    aria-label="Véhicule"
                    value={vehicle}
                    onChange={setVehicle}
                    options={[
                      { value: "", label: "Aucun" },
                      ...(options?.vehicles || []).map((option) => ({
                        value: option.name,
                        label: fleetOptionLabel(option, "vehicle"),
                      })),
                    ]}
                  />
                </label>
              </div>
              <Button
                type="button"
                variant="link"
                className="h-auto px-0"
                onClick={() => {
                  setError("");
                  setCreateMode((current) => (current === "new" ? "existing" : "new"));
                }}
              >
                {createMode === "new" ? "Utiliser un compte existant" : "Créer un nouveau compte"}
              </Button>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)} disabled={actions.saving}>
                Annuler
              </Button>
              <Button type="submit" disabled={!canCreate || actions.saving}>
                {actions.saving ? <LoaderCircle className="animate-spin" /> : <Plus />}
                Créer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {assigning && (
        <AssignDialog
          open={Boolean(assigning)}
          onOpenChange={(open) => {
            if (!open) setAssigning(null);
          }}
          title={`Véhicule de ${assigning.label}`}
          description="L’affectation est unique : l’ancien véhicule et l’ancien chauffeur sont libérés."
          label="Véhicule"
          mode="vehicle"
          options={options?.vehicles || []}
          value={assigning.vehicle || ""}
          emptyLabel="Aucun véhicule"
          saving={actions.saving}
          onSubmit={async (next, reason) => {
            await actions.assignDriverVehicle(assigning.name, next || null, reason);
            toast.success(next ? "Véhicule assigné." : "Véhicule retiré.");
            await Promise.all([mutate(), refreshOptions()]);
            setAssigning(null);
          }}
        />
      )}
    </>
  );
}

export default DriversPage;
