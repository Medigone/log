import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  Download,
  ListChecks,
  LoaderCircle,
  MapPinOff,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  UserCheck,
  UserX,
  Users,
  X,
} from "lucide-react";
import { FilterSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { KpiTile } from "@/components/ui/kpi-tile";
import { ListPagination } from "@/components/ui/list-pagination";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Toolbar } from "@/components/ui/toolbar";
import { namesToOptions, pageRange, useDebouncedValue } from "@/features/catalog/catalogShared";
import { BulkCustomerDialog } from "@/features/customers/BulkCustomerDialog";
import { CUSTOMER_PAGE_SIZE, customersToCsv, downloadText, statusTone } from "@/features/customers/customerShared";
import { NewCustomerDialog } from "@/features/customers/NewCustomerDialog";
import {
  CUSTOMER_FILTER_LABELS,
  CUSTOMER_SORT_LABELS,
  useCustomerMutations,
  useCustomerOptions,
  useCustomers,
  type CustomerListFilter,
  type CustomerRow,
  type CustomerSort,
} from "@/shared/api/customers";
import { apiErrorMessage } from "@/shared/api/distribution";
import { formatMoney, formatShortDate } from "@/shared/format";

const FILTER_OPTIONS = (Object.keys(CUSTOMER_FILTER_LABELS) as CustomerListFilter[]).map((value) => ({
  value,
  label: CUSTOMER_FILTER_LABELS[value],
}));
const SORT_OPTIONS = (Object.keys(CUSTOMER_SORT_LABELS) as CustomerSort[]).map((value) => ({
  value,
  label: CUSTOMER_SORT_LABELS[value],
}));

export function CustomersPage() {
  const navigate = useNavigate();
  const searchRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CustomerListFilter>("tous");
  const [customerGroup, setCustomerGroup] = useState("");
  const [wilaya, setWilaya] = useState("");
  const [sort, setSort] = useState<CustomerSort>("recent");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selected, setSelected] = useState<Map<string, CustomerRow>>(new Map());
  const debouncedSearch = useDebouncedValue(search.trim());
  const filters = { search: debouncedSearch, status, customerGroup, wilaya, sort };
  const query = { ...filters, start: (page - 1) * CUSTOMER_PAGE_SIZE, limit: CUSTOMER_PAGE_SIZE };
  const { data, error, isLoading, isValidating, mutate } = useCustomers(query);
  const { data: optionsData } = useCustomerOptions();
  const api = useCustomerMutations();
  const options = optionsData?.message;
  const list = data?.message;
  const rows = useMemo(() => list?.customers ?? [], [list]);
  const counts = list?.counts;
  const total = list?.total ?? 0;
  const { from, to } = pageRange(query.start, rows.length, total);

  // « / » place le curseur dans la recherche.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (event.key !== "/" || target?.closest("input, textarea, [contenteditable=true], [role=dialog]")) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const changeFilter = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };
  const pickStatus = changeFilter<CustomerListFilter>(setStatus);
  const open = (row: CustomerRow) => navigate(`/clients/${encodeURIComponent(row.name)}`);

  const toggle = (row: CustomerRow) =>
    setSelected((current) => {
      const next = new Map(current);
      if (next.has(row.name)) next.delete(row.name);
      else next.set(row.name, row);
      return next;
    });
  const pageSelected = rows.length > 0 && rows.every((row) => selected.has(row.name));
  const togglePage = () =>
    setSelected((current) => {
      const next = new Map(current);
      for (const row of rows) {
        if (pageSelected) next.delete(row.name);
        else next.set(row.name, row);
      }
      return next;
    });

  const exportCsv = async () => {
    try {
      let exported: CustomerRow[];
      if (selected.size) {
        exported = [...selected.values()];
      } else {
        const result = await api.exportCustomers(filters);
        exported = result.customers;
        if (result.truncated) toast.warning(`Export limité aux ${exported.length} premiers clients sur ${result.total}.`);
      }
      downloadText(`clients-${new Date().toISOString().slice(0, 10)}.csv`, customersToCsv(exported));
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const columns: Array<DataTableColumn<CustomerRow>> = [
    {
      id: "select",
      header: (
        <Checkbox
          checked={pageSelected}
          onCheckedChange={togglePage}
          aria-label="Sélectionner la page"
          onClick={(event) => event.stopPropagation()}
        />
      ),
      width: "44px",
      cell: (row) => (
        <span onClick={(event) => event.stopPropagation()} className="flex">
          <Checkbox checked={selected.has(row.name)} onCheckedChange={() => toggle(row)} aria-label={`Sélectionner ${row.customer_name}`} />
        </span>
      ),
    },
    {
      id: "customer",
      header: "Client",
      cell: (row) => (
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 truncate font-medium">
            <span className="truncate">{row.customer_name}</span>
            {row.key_account ? <StatusBadge tone="info" size="sm" dot={false}>Grand compte</StatusBadge> : null}
          </p>
          <p className="truncate t-meta text-subtle">
            {row.name}
            {row.customer_group ? ` · ${row.customer_group}` : ""}
          </p>
        </div>
      ),
    },
    {
      id: "location",
      header: "Localisation",
      width: "190px",
      hideBelow: "lg",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate">{row.commune_name || "—"}</p>
          <p className="flex items-center gap-1 truncate t-meta text-subtle">
            {row.wilaya}
            {row.has_gps ? null : (
              <span className="inline-flex items-center gap-0.5 text-amber-700">
                <MapPinOff className="size-3" /> sans GPS
              </span>
            )}
          </p>
        </div>
      ),
    },
    {
      id: "phone",
      header: "Téléphone",
      width: "140px",
      hideBelow: "md",
      cell: (row) =>
        row.phone ? (
          <a href={`tel:${row.phone}`} onClick={(event) => event.stopPropagation()} className="tabular-nums hover:underline">
            {row.phone}
          </a>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "last_order",
      header: "Dern. commande",
      width: "130px",
      hideBelow: "xl",
      cell: (row) => (row.last_order ? formatShortDate(row.last_order) : <span className="text-muted-foreground">—</span>),
    },
    {
      id: "balance",
      header: "Solde",
      width: "130px",
      align: "right",
      numeric: true,
      cell: (row) => (
        <span className={row.balance > 0 ? "font-medium text-amber-800" : row.balance < 0 ? "text-emerald-700" : "text-muted-foreground"}>
          {formatMoney(row.balance)}
        </span>
      ),
    },
    {
      id: "status",
      header: "Statut",
      width: "120px",
      hideBelow: "sm",
      cell: (row) =>
        row.disabled ? (
          <StatusBadge tone="neutral">Désactivé</StatusBadge>
        ) : (
          <StatusBadge tone={statusTone(row.status)}>{row.status || "—"}</StatusBadge>
        ),
    },
  ];

  const kpiClass = (value: CustomerListFilter) => (status === value ? "border-brand-300 bg-brand-50/50" : undefined);
  const filtered = Boolean(debouncedSearch || customerGroup || wilaya || status !== "tous");

  return (
    <>
      <PageHeader
        eyebrow="Ventes"
        title="Clients"
        description="Fiches clients, contacts, adresses, conditions commerciales, encours et accès portail."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void mutate()} disabled={isValidating}>
              {isValidating ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
              Actualiser
            </Button>
            <Button variant="outline" onClick={() => void exportCsv()} disabled={api.exporting}>
              {api.exporting ? <LoaderCircle className="animate-spin" /> : <Download />}
              {selected.size ? `Exporter la sélection` : "Exporter"}
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus /> Nouveau client
            </Button>
          </div>
        }
      />

      <section aria-label="Indicateurs clients" className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiTile icon={Users} tone="neutral" label="Tous" value={counts ? counts.tous : "—"} onClick={() => pickStatus("tous")} className={kpiClass("tous")} />
        <KpiTile icon={UserCheck} tone="success" label="Actifs" value={counts ? counts.Actif : "—"} onClick={() => pickStatus("Actif")} className={kpiClass("Actif")} />
        <KpiTile icon={Sparkles} tone={counts?.Prospect ? "info" : "neutral"} label="Prospects" value={counts ? counts.Prospect : "—"} onClick={() => pickStatus("Prospect")} className={kpiClass("Prospect")} />
        <KpiTile icon={Moon} tone={counts?.Dormant ? "warning" : "neutral"} label="Dormants" value={counts ? counts.Dormant : "—"} onClick={() => pickStatus("Dormant")} className={kpiClass("Dormant")} />
        <KpiTile icon={MapPinOff} tone={counts?.sans_gps ? "warning" : "neutral"} label="Sans GPS" value={counts ? counts.sans_gps : "—"} onClick={() => pickStatus("sans_gps")} className={kpiClass("sans_gps")} />
        <KpiTile icon={UserX} tone="neutral" label="Désactivés" value={counts ? counts.desactives : "—"} onClick={() => pickStatus("desactives")} className={kpiClass("desactives")} />
      </section>

      <Toolbar>
        <InputGroup className="min-w-48 flex-1 bg-background">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            ref={searchRef}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && rows.length === 1) open(rows[0]);
            }}
            placeholder="Nom, code, téléphone, commune, NIF, RC…  ( / )"
            aria-label="Rechercher un client"
          />
        </InputGroup>
        <FilterSelect label="Statut" value={status} onChange={(value) => pickStatus(value as CustomerListFilter)} options={FILTER_OPTIONS} />
        <FilterSelect
          label="Catégorie"
          value={customerGroup}
          onChange={changeFilter(setCustomerGroup)}
          options={namesToOptions(options?.customer_groups, "Toutes les catégories")}
        />
        <FilterSelect label="Wilaya" value={wilaya} onChange={changeFilter(setWilaya)} options={namesToOptions(options?.wilayas, "Toutes les wilayas")} />
        <FilterSelect label="Tri" value={sort} onChange={(value) => changeFilter(setSort)(value as CustomerSort)} options={SORT_OPTIONS} />
      </Toolbar>

      {selected.size ? (
        <div role="region" aria-label="Sélection" className="flex flex-wrap items-center gap-2 rounded-lg border border-brand-200 bg-brand-50/60 px-3 py-2">
          <span className="text-sm font-medium">
            {selected.size} client{selected.size > 1 ? "s" : ""} sélectionné{selected.size > 1 ? "s" : ""}
          </span>
          <span className="flex-1" />
          <Button size="sm" onClick={() => setBulkOpen(true)}>
            <ListChecks /> Modifier la sélection
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Map())}>
            <X /> Désélectionner
          </Button>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          {apiErrorMessage(error)}
        </p>
      ) : null}

      <DataTable
        label="Clients"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.name}
        rowTone={(row) => (row.disabled ? "neutral" : row.is_frozen ? "danger" : undefined)}
        isRowActive={(row) => selected.has(row.name)}
        onRowClick={open}
        isLoading={isLoading && !rows.length}
        empty={
          <EmptyState
            icon={Users}
            title={filtered ? "Aucun client ne correspond" : "Aucun client"}
            description={filtered ? "Modifiez la recherche ou les filtres." : "Créez le premier client."}
            action={
              filtered ? null : (
                <Button onClick={() => setCreating(true)}>
                  <Plus /> Nouveau client
                </Button>
              )
            }
          />
        }
      />

      <ListPagination
        page={page}
        totalPages={Math.max(1, Math.ceil(total / CUSTOMER_PAGE_SIZE))}
        total={total}
        from={from}
        to={to}
        onPageChange={setPage}
      />

      <NewCustomerDialog
        open={creating}
        onOpenChange={setCreating}
        options={options}
        onSubmit={async (payload) => {
          const created = await api.createCustomer(payload);
          setCreating(false);
          void mutate();
          toast.success(`Client ${created.customer_name} créé.`);
          navigate(`/clients/${encodeURIComponent(created.name)}`);
        }}
      />

      <BulkCustomerDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        count={selected.size}
        options={options}
        onSubmit={async (changes) => {
          const result = await api.bulkUpdate([...selected.keys()], changes);
          setBulkOpen(false);
          void mutate();
          if (result.updated.length) toast.success(`${result.updated.length} client(s) modifié(s).`);
          if (result.errors.length) {
            toast.error(`${result.errors.length} échec(s) : ${result.errors.map((item) => `${item.name} — ${item.error}`).join(" ; ")}`);
            setSelected((current) => new Map([...current].filter(([name]) => result.errors.some((item) => item.name === name))));
          } else {
            setSelected(new Map());
          }
        }}
      />
    </>
  );
}
