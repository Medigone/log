import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ListPlus, Pencil, Search, Tags, WandSparkles } from "lucide-react";
import { CommitInput } from "@/components/CommitInput";
import { FilterSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { ListPagination } from "@/components/ui/list-pagination";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Toolbar } from "@/components/ui/toolbar";
import { BulkPriceDialog } from "@/features/catalog/BulkPriceDialog";
import {
  CATALOG_PAGE_SIZE,
  leafGroupOptions,
  marginOf,
  namesToOptions,
  pageRange,
  useDebouncedValue,
  type PendingPriceChange,
} from "@/features/catalog/catalogShared";
import { PriceChangeDialog } from "@/features/catalog/PriceChangeDialog";
import { PriceListDialog } from "@/features/catalog/PriceListDialog";
import {
  useCatalogMutations,
  useCatalogOptions,
  usePriceGrid,
  usePriceLists,
  type CatalogPriceList,
  type PriceGridRow,
} from "@/shared/api/catalog";
import { apiErrorMessage } from "@/shared/api/distribution";
import { formatMoney } from "@/shared/format";
import { parseDecimal } from "@/shared/format/parseDecimal";

export function PriceGridPage() {
  const { data: optionsData } = useCatalogOptions();
  const { data: listsData, mutate: mutateLists } = usePriceLists();
  const api = useCatalogMutations();
  const options = optionsData?.message;
  const lists = useMemo(() => listsData?.message ?? [], [listsData]);
  const [chosenList, setChosenList] = useState("");
  const priceList = chosenList || options?.selling_price_list || lists[0]?.name || "";
  const [search, setSearch] = useState("");
  const [itemGroup, setItemGroup] = useState("");
  const [brand, setBrand] = useState("");
  const [page, setPage] = useState(1);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [editingList, setEditingList] = useState<CatalogPriceList | null | undefined>(undefined);
  const [pendingPrice, setPendingPrice] = useState<PendingPriceChange | null>(null);
  const debouncedSearch = useDebouncedValue(search.trim());
  const start = (page - 1) * CATALOG_PAGE_SIZE;
  const { data, error, isLoading, mutate } = usePriceGrid(priceList, {
    search: debouncedSearch,
    itemGroup,
    brand,
    start,
    limit: CATALOG_PAGE_SIZE,
  });
  const grid = data?.message;
  const rows = grid?.items ?? [];
  const total = grid?.total ?? 0;
  const { from, to } = pageRange(start, rows.length, total);
  const current = lists.find((list) => list.name === priceList);
  const isBuying = Boolean(current?.buying && !current.selling);

  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(1);
  };

  // Un prix saisi n'est enregistré qu'après confirmation.
  const commit = (row: PriceGridRow, raw: string) => {
    const rate = parseDecimal(raw);
    if (rate === null || rate < 0 || rate === row.rate) return;
    setPendingPrice({ row, rate });
  };

  const applyPrice = async ({ row, rate }: PendingPriceChange) => {
    try {
      await api.setGridPrice(priceList, row.item_code, rate);
      await mutate();
      toast.success(`Prix de ${row.item_name} enregistré : ${formatMoney(rate, { precise: true })}.`);
      setPendingPrice(null);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const columns: Array<DataTableColumn<PriceGridRow>> = [
    {
      id: "item",
      header: "Article",
      cell: (row) => (
        <div className="min-w-0">
          <Link to={`/articles/${encodeURIComponent(row.item_code)}?tab=prix`} className="block truncate font-medium hover:underline">
            {row.item_name}
          </Link>
          <p className="truncate t-meta text-subtle">
            {row.item_code}
            {row.brand ? ` · ${row.brand}` : ""}
          </p>
        </div>
      ),
    },
    { id: "group", header: "Groupe", width: "180px", hideBelow: "lg", cell: (row) => <span className="truncate text-muted-foreground">{row.item_group || "—"}</span> },
    {
      id: "buying",
      header: "Achat",
      width: "110px",
      align: "right",
      numeric: true,
      hideBelow: "md",
      cell: (row) => (row.buying_rate == null ? "—" : formatMoney(row.buying_rate)),
    },
    {
      id: "rate",
      header: `Prix · ${row0Uom(rows)}`,
      width: "150px",
      align: "right",
      cell: (row) => (
        <CommitInput
          inputMode="decimal"
          className="num h-8 text-right"
          aria-label={`Prix de ${row.item_name}`}
          placeholder="Aucun"
          value={row.rate == null ? "" : String(row.rate)}
          onCommit={(value) => commit(row, value)}
        />
      ),
    },
    {
      id: "margin",
      header: "Marge",
      width: "100px",
      align: "right",
      numeric: true,
      hideBelow: "sm",
      cell: (row) => {
        if (isBuying) return "—";
        const margin = marginOf(row.rate, row.buying_rate);
        if (!margin) return "—";
        return (
          <span className={margin.amount < 0 ? "text-red-700" : undefined}>
            {margin.rate.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %
          </span>
        );
      },
    },
    {
      id: "ppa",
      header: "PPA",
      width: "110px",
      align: "right",
      numeric: true,
      hideBelow: "xl",
      cell: (row) => (row.ppa ? formatMoney(row.ppa) : "—"),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Catalogue"
        title="Prix"
        description="Saisissez les prix d’une liste article par article, ou appliquez une mise à jour en masse."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEditingList(null)}>
              <ListPlus /> Nouvelle liste
            </Button>
            <Button onClick={() => setBulkOpen(true)} disabled={!priceList}>
              <WandSparkles /> Mise à jour en masse
            </Button>
          </div>
        }
      />

      <section aria-label="Listes de prix" className="flex flex-wrap gap-2">
        {lists.map((list) => (
          <div
            key={list.name}
            className={
              list.name === priceList
                ? "flex items-center gap-1 rounded-lg border border-brand-300 bg-brand-50/50 pr-1"
                : "flex items-center gap-1 rounded-lg border bg-card pr-1"
            }
          >
            <button
              type="button"
              className="flex items-center gap-2 px-3 py-2 text-sm font-medium"
              aria-pressed={list.name === priceList}
              onClick={() => {
                setChosenList(list.name);
                setPage(1);
              }}
            >
              {list.name}
              <StatusBadge tone={list.enabled ? (list.selling ? "info" : "neutral") : "warning"} size="sm" dot={false}>
                {!list.enabled ? "Inactive" : list.selling && list.buying ? "Vente + achat" : list.selling ? "Vente" : "Achat"}
              </StatusBadge>
              <span className="num t-meta text-muted-foreground">{list.item_count ?? 0}</span>
            </button>
            <Button variant="ghost" size="icon-sm" aria-label={`Modifier la liste ${list.name}`} onClick={() => setEditingList(list)}>
              <Pencil />
            </Button>
          </div>
        ))}
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
        <FilterSelect
          label="Groupe"
          value={itemGroup}
          onChange={resetPage(setItemGroup)}
          options={[{ value: "", label: "Tous les groupes" }, ...leafGroupOptions(options?.item_groups)]}
        />
        <FilterSelect label="Marque" value={brand} onChange={resetPage(setBrand)} options={namesToOptions(options?.brands, "Toutes les marques")} />
      </Toolbar>

      {error ? (
        <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          {apiErrorMessage(error)}
        </p>
      ) : null}

      <DataTable
        label={`Prix ${priceList}`}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.item_code}
        rowTone={(row) => (row.rate == null ? "warning" : undefined)}
        isLoading={isLoading && !rows.length}
        empty={<EmptyState icon={Tags} title="Aucun article" description="Modifiez la recherche ou les filtres." />}
      />

      <ListPagination page={page} totalPages={Math.max(1, Math.ceil(total / CATALOG_PAGE_SIZE))} total={total} from={from} to={to} onPageChange={setPage} />

      {pendingPrice ? (
        <PriceChangeDialog
          change={pendingPrice}
          priceList={priceList}
          isBuying={isBuying}
          onCancel={() => setPendingPrice(null)}
          onConfirm={() => applyPrice(pendingPrice)}
        />
      ) : null}
      <BulkPriceDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        priceList={priceList}
        options={options}
        defaultGroup={itemGroup}
        defaultBrand={brand}
        run={api.bulkUpdatePrices}
        onApplied={() => {
          void mutate();
          void mutateLists();
        }}
      />

      <PriceListDialog
        open={editingList !== undefined}
        onOpenChange={(open) => !open && setEditingList(undefined)}
        priceList={editingList ?? null}
        onSubmit={async (payload) => {
          const saved = await api.savePriceList(payload);
          setEditingList(undefined);
          setChosenList(saved.name);
          toast.success(payload.name ? "Liste de prix enregistrée" : "Liste de prix créée");
          await mutateLists();
        }}
      />
    </>
  );
}

function row0Uom(rows: PriceGridRow[]) {
  const uoms = new Set(rows.map((row) => row.stock_uom));
  return uoms.size === 1 ? [...uoms][0] : "unité de stock";
}
