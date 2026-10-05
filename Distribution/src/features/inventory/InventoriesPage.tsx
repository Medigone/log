import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ClipboardCheck, ClipboardList, LoaderCircle, Plus, RefreshCw, ScanBarcode, Search } from "lucide-react";
import { FilterSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { KpiTile } from "@/components/ui/kpi-tile";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Toolbar } from "@/components/ui/toolbar";
import { NewInventoryDialog } from "@/features/inventory/NewInventoryDialog";
import { scopeSummary } from "@/features/inventory/inventoryFormat";
import { inventoryStatusTone } from "@/features/inventory/inventoryStatus";
import {
  apiErrorMessage,
  INVENTORY_STATUS_LABELS,
  useInventories,
  useInventoryMutations,
  useInventoryOptions,
  type Inventory,
  type InventoryStatus,
} from "@/shared/api/inventory";
import { formatShortDate } from "@/shared/format";

type Filter = "all" | InventoryStatus;

const FILTER_OPTIONS: Array<{ value: Filter; label: string }> = [
  { value: "all", label: "Tous" },
  { value: "Brouillon", label: "Brouillons" },
  { value: "En cours", label: "Comptage en cours" },
  { value: "En revue", label: "En revue" },
  { value: "Validé", label: "Validés" },
  { value: "Annulé", label: "Annulés" },
];

export function InventoriesPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const { data, error, isLoading, mutate } = useInventories();
  const { data: optionsData } = useInventoryOptions();
  const api = useInventoryMutations();
  const inventories = useMemo(() => data?.message ?? [], [data]);
  const canManage = Boolean(optionsData?.message?.can_validate);

  const counts = useMemo(() => {
    const byStatus = (status: InventoryStatus) => inventories.filter((row) => row.status === status).length;
    return { counting: byStatus("En cours"), review: byStatus("En revue"), drafts: byStatus("Brouillon") };
  }, [inventories]);

  const rows = useMemo(() => {
    const haystack = search.trim().toLocaleLowerCase("fr");
    return inventories.filter((row) => {
      if (filter !== "all" && row.status !== filter) return false;
      if (!haystack) return true;
      return [row.name, row.titre, scopeSummary(row)].some((value) => value.toLocaleLowerCase("fr").includes(haystack));
    });
  }, [inventories, filter, search]);

  const open = (row: Inventory) => navigate(`/inventaires/${encodeURIComponent(row.name)}`);

  const columns: Array<DataTableColumn<Inventory>> = [
    {
      id: "title",
      header: "Inventaire",
      sortValue: (row) => row.titre,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.titre}</p>
          <p className="truncate t-meta text-subtle">
            {row.name} · {scopeSummary(row)}
          </p>
        </div>
      ),
    },
    {
      id: "date",
      header: "Créé le",
      width: "110px",
      hideBelow: "md",
      sortValue: (row) => row.creation || "",
      cell: (row) => <span className="num">{formatShortDate(row.creation?.slice(0, 10))}</span>,
    },
    {
      id: "progress",
      header: "Avancement",
      width: "170px",
      hideBelow: "sm",
      sortValue: (row) => row.progress?.percent ?? 0,
      cell: (row) =>
        row.progress && row.progress.total ? (
          <div className="flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-brand-600" style={{ width: `${row.progress.percent}%` }} />
            </div>
            <span className="num w-20 text-right text-[12px] text-muted-foreground">
              {row.progress.counted}/{row.progress.total}
            </span>
          </div>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "status",
      header: "Statut",
      width: "160px",
      sortValue: (row) => row.status,
      cell: (row) => <StatusBadge tone={inventoryStatusTone(row.status)}>{INVENTORY_STATUS_LABELS[row.status]}</StatusBadge>,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Opérationnel"
        title="Inventaires"
        description="Comptez le stock par scan, global ou par entrepôt, groupe, marque ou article, sans arrêter l’activité."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void mutate()} disabled={isLoading}>
              {isLoading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
              Actualiser
            </Button>
            {canManage ? (
              <Button onClick={() => setCreating(true)}>
                <Plus /> Nouvel inventaire
              </Button>
            ) : null}
          </div>
        }
      />

      <section aria-label="Indicateurs des inventaires" className="grid gap-3 sm:grid-cols-3">
        <KpiTile
          icon={ScanBarcode}
          tone={counts.counting ? "info" : "neutral"}
          label="Comptage en cours"
          value={data ? counts.counting : "—"}
          onClick={() => setFilter("En cours")}
          className={filter === "En cours" ? "border-brand-300 bg-brand-50/50" : undefined}
        />
        <KpiTile
          icon={ClipboardCheck}
          tone={counts.review ? "warning" : "neutral"}
          label="À valider"
          value={data ? counts.review : "—"}
          hint="Écarts à relire par le responsable"
          onClick={() => setFilter("En revue")}
          className={filter === "En revue" ? "border-brand-300 bg-brand-50/50" : undefined}
        />
        <KpiTile
          icon={ClipboardList}
          label="Brouillons"
          value={data ? counts.drafts : "—"}
          hint="Périmètre défini, comptage non lancé"
          onClick={() => setFilter("Brouillon")}
          className={filter === "Brouillon" ? "border-brand-300 bg-brand-50/50" : undefined}
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
            placeholder="Titre, n° ou périmètre…"
            aria-label="Rechercher un inventaire"
          />
        </InputGroup>
        <FilterSelect label="Statut" value={filter} onChange={(value) => setFilter(value as Filter)} options={FILTER_OPTIONS} />
      </Toolbar>

      {error ? (
        <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          {apiErrorMessage(error)}
        </p>
      ) : null}

      <DataTable
        label="Inventaires"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.name}
        rowTone={(row) => inventoryStatusTone(row.status)}
        onRowClick={open}
        isLoading={isLoading && !inventories.length}
        empty={
          <EmptyState
            icon={ClipboardList}
            title={search || filter !== "all" ? "Aucun inventaire ne correspond" : "Aucun inventaire"}
            description={
              canManage
                ? "Créez un inventaire global ou partiel, puis lancez le comptage."
                : "Les inventaires lancés par le responsable apparaîtront ici."
            }
            action={
              canManage && !search ? (
                <Button onClick={() => setCreating(true)}>
                  <Plus /> Nouvel inventaire
                </Button>
              ) : null
            }
          />
        }
      />

      {canManage ? (
        <NewInventoryDialog
          open={creating}
          onOpenChange={setCreating}
          options={optionsData?.message}
          previewScope={api.previewScope}
          onSubmit={async (input) => {
            const created = await api.createInventory(input);
            setCreating(false);
            void mutate();
            navigate(`/inventaires/${encodeURIComponent(created.name)}`);
          }}
        />
      ) : null}
    </>
  );
}
