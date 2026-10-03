import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, ClipboardCheck, LoaderCircle, PackageCheck, PackageOpen, Plus, RefreshCw, Search } from "lucide-react";
import { FilterSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { KpiTile } from "@/components/ui/kpi-tile";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Toolbar } from "@/components/ui/toolbar";
import { NewReceiptDialog } from "@/features/receipts/NewReceiptDialog";
import { receiptStatusTone } from "@/features/receipts/receiptStatus";
import { apiErrorMessage } from "@/shared/api/distribution";
import {
  RECEIPT_STATUS_LABELS,
  useReceiptMutations,
  useReceiptOptions,
  useReceipts,
  type ReceiptListFilter,
  type ReceiptSummary,
} from "@/shared/api/receipts";
import { formatMoney, formatQuantity, formatShortDate } from "@/shared/format";

const FILTER_OPTIONS: Array<{ value: ReceiptListFilter; label: string }> = [
  { value: "all", label: "Toutes" },
  { value: "ouvertes", label: "En cours et à valider" },
  { value: "en_cours", label: "En cours" },
  { value: "a_valider", label: "À valider" },
  { value: "valide", label: "Validées" },
];

export function ReceiptsPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<ReceiptListFilter>("all");
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const { data, error, isLoading, mutate } = useReceipts(filter);
  const { data: optionsData } = useReceiptOptions();
  const api = useReceiptMutations();
  const receipts = useMemo(() => data?.message?.receipts ?? [], [data]);
  const counts = data?.message?.counts;

  const rows = useMemo(() => {
    const haystack = search.trim().toLocaleLowerCase("fr");
    if (!haystack) return receipts;
    return receipts.filter((row) =>
      [row.name, row.supplier_name, row.supplier, row.supplier_delivery_note, row.warehouse]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("fr").includes(haystack)),
    );
  }, [receipts, search]);

  const open = (row: ReceiptSummary) => navigate(`/receptions/${encodeURIComponent(row.name)}`);

  const columns: Array<DataTableColumn<ReceiptSummary>> = [
    {
      id: "supplier",
      header: "Fournisseur",
      sortValue: (row) => row.supplier_name,
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.supplier_name}</p>
          <p className="truncate t-meta text-subtle">
            {row.name}
            {row.supplier_delivery_note ? ` · BL ${row.supplier_delivery_note}` : ""}
          </p>
        </div>
      ),
    },
    {
      id: "date",
      header: "Date",
      width: "110px",
      sortValue: (row) => row.posting_date || "",
      cell: (row) => <span className="num">{formatShortDate(row.posting_date || undefined)}</span>,
    },
    {
      id: "warehouse",
      header: "Entrepôt",
      width: "170px",
      hideBelow: "lg",
      cell: (row) => <span className="truncate text-muted-foreground">{row.warehouse || "—"}</span>,
    },
    {
      id: "lines",
      header: "Lignes",
      width: "80px",
      align: "right",
      numeric: true,
      hideBelow: "sm",
      sortValue: (row) => row.lines,
      cell: (row) => row.lines,
    },
    {
      id: "qty",
      header: "Unités",
      width: "90px",
      align: "right",
      numeric: true,
      hideBelow: "md",
      sortValue: (row) => row.total_qty,
      cell: (row) => formatQuantity(row.total_qty),
    },
    {
      id: "total",
      header: "Total",
      width: "130px",
      align: "right",
      numeric: true,
      hideBelow: "md",
      sortValue: (row) => row.grand_total,
      cell: (row) => <span className="font-medium">{formatMoney(row.grand_total)}</span>,
    },
    {
      id: "status",
      header: "Statut",
      width: "120px",
      sortValue: (row) => row.status,
      cell: (row) => <StatusBadge tone={receiptStatusTone(row.status)}>{RECEIPT_STATUS_LABELS[row.status]}</StatusBadge>,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Achats"
        title="Réceptions marchandise"
        description="Scannez les articles livrés par le fournisseur pour créer le Reçu d’Achat."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void mutate()} disabled={isLoading}>
              {isLoading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
              Actualiser
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus /> Nouvelle réception
            </Button>
          </div>
        }
      />

      <section aria-label="Indicateurs des réceptions" className="grid gap-3 sm:grid-cols-3">
        <KpiTile
          icon={PackageOpen}
          tone={counts?.en_cours ? "info" : "neutral"}
          label="En cours de saisie"
          value={counts ? counts.en_cours : "—"}
          onClick={() => setFilter("en_cours")}
          className={filter === "en_cours" ? "border-brand-300 bg-brand-50/50" : undefined}
        />
        <KpiTile
          icon={ClipboardCheck}
          tone={counts?.a_valider ? "warning" : "neutral"}
          label="À valider"
          value={counts ? counts.a_valider : "—"}
          hint="Saisie terminée par le magasinier"
          onClick={() => setFilter("a_valider")}
          className={filter === "a_valider" ? "border-brand-300 bg-brand-50/50" : undefined}
        />
        <KpiTile
          icon={PackageCheck}
          tone="success"
          label="Validées (30 j)"
          value={counts ? counts.valide_30j : "—"}
          onClick={() => setFilter("valide")}
          className={filter === "valide" ? "border-brand-300 bg-brand-50/50" : undefined}
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
            placeholder="Fournisseur, n° de réception ou BL…"
            aria-label="Rechercher une réception"
          />
        </InputGroup>
        <FilterSelect
          label="Statut"
          value={filter}
          onChange={(value) => setFilter(value as ReceiptListFilter)}
          options={FILTER_OPTIONS}
        />
      </Toolbar>

      {error ? (
        <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          {apiErrorMessage(error)}
        </p>
      ) : null}

      <DataTable
        label="Réceptions"
        columns={columns}
        rows={rows}
        rowKey={(row) => row.name}
        rowTone={(row) => receiptStatusTone(row.status)}
        onRowClick={open}
        isLoading={isLoading && !receipts.length}
        empty={
          <EmptyState
            icon={PackageOpen}
            title={search ? "Aucune réception ne correspond" : "Aucune réception"}
            description={search ? "Modifiez la recherche ou le filtre." : "Commencez une réception à l’arrivée d’une livraison fournisseur."}
            action={
              search ? null : (
                <Button onClick={() => setCreating(true)}>
                  <Plus /> Nouvelle réception
                </Button>
              )
            }
          />
        }
      />

      <NewReceiptDialog
        open={creating}
        onOpenChange={setCreating}
        options={optionsData?.message}
        searchSuppliers={api.searchSuppliers}
        createSupplier={(supplierName) => api.createSupplier(supplierName)}
        onSubmit={async (payload) => {
          const created = await api.createReceipt(payload);
          setCreating(false);
          navigate(`/receptions/${encodeURIComponent(created.name)}`);
        }}
      />
    </>
  );
}
