import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Boxes, EyeOff, LoaderCircle, PackageX, Plus, RefreshCw, Search, TagIcon } from "lucide-react";
import { FilterSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { KpiTile } from "@/components/ui/kpi-tile";
import { ListPagination } from "@/components/ui/list-pagination";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Toolbar } from "@/components/ui/toolbar";
import { CATALOG_PAGE_SIZE, leafGroupOptions, namesToOptions, pageRange, useDebouncedValue } from "@/features/catalog/catalogShared";
import { ItemThumb } from "@/features/catalog/ItemThumb";
import { NewItemDialog } from "@/features/catalog/NewItemDialog";
import {
  ITEM_STATUS_LABELS,
  useCatalogItems,
  useCatalogMutations,
  useCatalogOptions,
  type CatalogItemRow,
  type CatalogItemStatus,
} from "@/shared/api/catalog";
import { apiErrorMessage } from "@/shared/api/distribution";
import { formatMoney, formatQuantity } from "@/shared/format";

const STATUS_OPTIONS = (Object.keys(ITEM_STATUS_LABELS) as CatalogItemStatus[]).map((value) => ({
  value,
  label: ITEM_STATUS_LABELS[value],
}));

export function ItemsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<CatalogItemStatus>("actifs");
  const [itemGroup, setItemGroup] = useState("");
  const [brand, setBrand] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const debouncedSearch = useDebouncedValue(search.trim());
  const query = {
    search: debouncedSearch,
    status,
    itemGroup,
    brand,
    start: (page - 1) * CATALOG_PAGE_SIZE,
    limit: CATALOG_PAGE_SIZE,
  };
  const { data, error, isLoading, isValidating, mutate } = useCatalogItems(query);
  const { data: optionsData, mutate: mutateOptions } = useCatalogOptions();
  const api = useCatalogMutations();
  const options = optionsData?.message;
  const list = data?.message;
  const items = useMemo(() => list?.items ?? [], [list]);
  const counts = list?.counts;
  const total = list?.total ?? 0;
  const { from, to } = pageRange(query.start, items.length, total);

  const changeFilter = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };
  const pickStatus = changeFilter<CatalogItemStatus>(setStatus);
  const open = (row: CatalogItemRow) => navigate(`/articles/${encodeURIComponent(row.item_code)}`);

  const columns: Array<DataTableColumn<CatalogItemRow>> = [
    {
      id: "item",
      header: "Article",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          <ItemThumb image={row.image} />
          <div className="min-w-0">
            <p className="truncate font-medium">{row.item_name}</p>
            <p className="truncate t-meta text-subtle">
              {row.item_code}
              {row.brand ? ` · ${row.brand}` : ""}
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "group",
      header: "Groupe",
      width: "190px",
      hideBelow: "lg",
      cell: (row) => <span className="truncate text-muted-foreground">{row.item_group || "—"}</span>,
    },
    {
      id: "buying",
      header: "Achat",
      width: "110px",
      align: "right",
      numeric: true,
      hideBelow: "xl",
      cell: (row) => (row.buying_rate == null ? "—" : formatMoney(row.buying_rate)),
    },
    {
      id: "selling",
      header: "Vente",
      width: "120px",
      align: "right",
      numeric: true,
      cell: (row) =>
        row.selling_rate == null ? (
          <StatusBadge tone="warning" size="sm">Sans prix</StatusBadge>
        ) : (
          <span className="font-medium">{formatMoney(row.selling_rate)}</span>
        ),
    },
    {
      id: "ppa",
      header: "PPA",
      width: "110px",
      align: "right",
      numeric: true,
      hideBelow: "md",
      cell: (row) => (row.ppa ? formatMoney(row.ppa) : "—"),
    },
    {
      id: "stock",
      header: "Stock",
      width: "100px",
      align: "right",
      numeric: true,
      hideBelow: "sm",
      cell: (row) => (
        <span className={row.stock_qty > 0 ? undefined : "text-muted-foreground"}>
          {formatQuantity(row.stock_qty)} <span className="t-meta text-subtle">{row.stock_uom}</span>
        </span>
      ),
    },
    {
      id: "status",
      header: "Statut",
      width: "130px",
      hideBelow: "md",
      cell: (row) =>
        row.disabled ? (
          <StatusBadge tone="neutral">Désactivé</StatusBadge>
        ) : (
          <span className="flex flex-wrap gap-1">
            {row.show_in_store ? (
              <StatusBadge tone="success">Sur le Store</StatusBadge>
            ) : (
              <StatusBadge tone="info">Hors Store</StatusBadge>
            )}
            {row.quota_max_qty ? <StatusBadge tone="warning">Quota {formatQuantity(row.quota_max_qty)}</StatusBadge> : null}
          </span>
        ),
    },
  ];

  const kpiClass = (value: CatalogItemStatus) => (status === value ? "border-brand-300 bg-brand-50/50" : undefined);
  const filtered = Boolean(debouncedSearch || itemGroup || brand);

  return (
    <>
      <PageHeader
        eyebrow="Catalogue"
        title="Articles"
        description="Fiches articles, prix, codes-barres, TVA et visibilité sur le Store client."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void mutate()} disabled={isValidating}>
              {isValidating ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
              Actualiser
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus /> Nouvel article
            </Button>
          </div>
        }
      />

      <section aria-label="Indicateurs du catalogue" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={Boxes} tone="neutral" label="Articles actifs" value={counts ? counts.actifs : "—"} onClick={() => pickStatus("actifs")} className={kpiClass("actifs")} />
        <KpiTile
          icon={TagIcon}
          tone={counts?.sans_prix ? "warning" : "neutral"}
          label="Sans prix de vente"
          value={counts ? counts.sans_prix : "—"}
          hint={list?.selling_price_list || undefined}
          onClick={() => pickStatus("sans_prix")}
          className={kpiClass("sans_prix")}
        />
        <KpiTile icon={EyeOff} tone={counts?.hors_store ? "info" : "neutral"} label="Masqués du Store" value={counts ? counts.hors_store : "—"} onClick={() => pickStatus("hors_store")} className={kpiClass("hors_store")} />
        <KpiTile icon={PackageX} tone="neutral" label="Désactivés" value={counts ? counts.desactives : "—"} onClick={() => pickStatus("desactives")} className={kpiClass("desactives")} />
      </section>

      <Toolbar>
        <InputGroup className="min-w-48 flex-1 bg-background">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Désignation, code ou code-barres…"
            aria-label="Rechercher un article"
          />
        </InputGroup>
        <FilterSelect label="Statut" value={status} onChange={(value) => pickStatus(value as CatalogItemStatus)} options={STATUS_OPTIONS} />
        <FilterSelect
          label="Groupe"
          value={itemGroup}
          onChange={changeFilter(setItemGroup)}
          options={[{ value: "", label: "Tous les groupes" }, ...leafGroupOptions(options?.item_groups)]}
        />
        <FilterSelect label="Marque" value={brand} onChange={changeFilter(setBrand)} options={namesToOptions(options?.brands, "Toutes les marques")} />
      </Toolbar>

      {error ? (
        <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          {apiErrorMessage(error)}
        </p>
      ) : null}

      <DataTable
        label="Articles"
        columns={columns}
        rows={items}
        rowKey={(row) => row.item_code}
        rowTone={(row) => (row.disabled ? "neutral" : row.selling_rate == null ? "warning" : undefined)}
        onRowClick={open}
        isLoading={isLoading && !items.length}
        empty={
          <EmptyState
            icon={Boxes}
            title={filtered ? "Aucun article ne correspond" : "Aucun article"}
            description={filtered ? "Modifiez la recherche ou les filtres." : "Créez le premier article du catalogue."}
            action={
              filtered ? null : (
                <Button onClick={() => setCreating(true)}>
                  <Plus /> Nouvel article
                </Button>
              )
            }
          />
        }
      />

      <ListPagination
        page={page}
        totalPages={Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE))}
        total={total}
        from={from}
        to={to}
        onPageChange={setPage}
      />

      <NewItemDialog
        open={creating}
        onOpenChange={setCreating}
        options={options}
        onSubmit={async (payload) => {
          const created = await api.createItem(payload);
          setCreating(false);
          void mutate();
          navigate(`/articles/${encodeURIComponent(created.item_code)}`);
        }}
        onCreateBrand={async (name) => {
          const saved = await api.saveBrand({ brand: name });
          void mutateOptions();
          return saved.name;
        }}
      />
    </>
  );
}
