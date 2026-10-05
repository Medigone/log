import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  LoaderCircle,
  Play,
  RefreshCw,
  RotateCcw,
  ScanBarcode,
  Search,
  XCircle,
} from "lucide-react";
import { FilterSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
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
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { KpiTile } from "@/components/ui/kpi-tile";
import { PageHeader } from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { Toolbar } from "@/components/ui/toolbar";
import { cn } from "@/lib/utils";
import { matchesReviewFilter, scopeSummary, type ReviewFilter } from "@/features/inventory/inventoryFormat";
import { canCount, canReview, inventoryStatusTone, lineStatusTone } from "@/features/inventory/inventoryStatus";
import {
  apiErrorMessage,
  INVENTORY_STATUS_LABELS,
  useInventory,
  useInventoryMutations,
  useInventoryReview,
  type ReviewLine,
} from "@/shared/api/inventory";
import { formatMoney, formatQuantity, formatShortDate } from "@/shared/format";

const FILTER_OPTIONS: Array<{ value: ReviewFilter; label: string }> = [
  { value: "all", label: "Toutes les lignes" },
  { value: "variance", label: "Avec écart" },
  { value: "recount", label: "Au-delà du seuil" },
  { value: "uncounted", label: "Non comptées" },
  { value: "hors_liste", label: "Hors liste" },
];

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${formatQuantity(value)}`;
}

export function InventoryDetailPage() {
  const { inventoryId } = useParams();
  const name = inventoryId ? decodeURIComponent(inventoryId) : undefined;
  const { data, error, isLoading, mutate } = useInventory(name);
  const inventory = data?.message;
  const canValidate = Boolean(inventory?.can_validate);
  const review = useInventoryReview(name, canValidate && Boolean(inventory && inventory.status !== "Brouillon"));
  const api = useInventoryMutations();
  const [filter, setFilter] = useState<ReviewFilter>("variance");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [validating, setValidating] = useState(false);
  const [zeroUncounted, setZeroUncounted] = useState(false);
  const [busy, setBusy] = useState(false);

  const lines = useMemo(() => review.data?.message?.lines ?? [], [review.data]);
  const totals = review.data?.message?.totals;
  const rows = useMemo(() => {
    const haystack = search.trim().toLocaleLowerCase("fr");
    return lines.filter((line) => {
      if (!matchesReviewFilter(line, filter)) return false;
      if (!haystack) return true;
      return [line.item_code, line.item_name, line.warehouse, line.batch_no || ""].some((value) =>
        value.toLocaleLowerCase("fr").includes(haystack),
      );
    });
  }, [lines, filter, search]);

  const refresh = () => {
    void mutate();
    void review.mutate();
  };

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await action();
      toast.success(success);
      setSelected([]);
      refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const validate = async () => {
    if (!name) return;
    setBusy(true);
    try {
      const result = await api.validateInventory(name, zeroUncounted);
      setValidating(false);
      toast.success(
        result.queued
          ? "Validation lancée en arrière-plan. Le stock sera mis à jour dans quelques minutes."
          : result.stock_reconciliation
            ? `Stock mis à jour (${result.stock_reconciliation}).`
            : "Inventaire validé : aucun écart à passer en stock.",
      );
      refresh();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (lineName: string, checked: boolean) =>
    setSelected((current) => (checked ? [...current, lineName] : current.filter((value) => value !== lineName)));
  const recountable = rows.filter((line) => line.counted_qty != null);
  const allSelected = recountable.length > 0 && recountable.every((line) => selected.includes(line.name));

  const columns: Array<DataTableColumn<ReviewLine>> = [
    ...(canReview(inventory?.status ?? "Annulé")
      ? [
          {
            id: "select",
            header: (
              <Checkbox
                checked={allSelected}
                onCheckedChange={(checked) => setSelected(checked ? recountable.map((line) => line.name) : [])}
                aria-label="Tout sélectionner"
              />
            ),
            width: "40px",
            cell: (line: ReviewLine) =>
              line.counted_qty != null ? (
                <Checkbox
                  checked={selected.includes(line.name)}
                  onCheckedChange={(checked) => toggle(line.name, Boolean(checked))}
                  aria-label={`Sélectionner ${line.item_code}`}
                  onClick={(event) => event.stopPropagation()}
                />
              ) : null,
          } satisfies DataTableColumn<ReviewLine>,
        ]
      : []),
    {
      id: "item",
      header: "Article",
      sortValue: (line) => line.item_name,
      cell: (line) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{line.item_name}</p>
          <p className="truncate t-meta text-subtle">
            {line.item_code}
            {line.batch_no ? ` · lot ${line.batch_no}` : ""}
            {line.expiry_date ? ` · ${formatShortDate(line.expiry_date)}` : ""}
            {line.hors_liste ? " · hors liste" : ""}
          </p>
        </div>
      ),
    },
    {
      id: "warehouse",
      header: "Entrepôt",
      width: "150px",
      hideBelow: "lg",
      sortValue: (line) => line.warehouse,
      cell: (line) => <span className="truncate text-muted-foreground">{line.warehouse}</span>,
    },
    {
      id: "expected",
      header: "Théorique",
      width: "100px",
      align: "right",
      numeric: true,
      sortValue: (line) => line.expected_qty,
      cell: (line) => formatQuantity(line.expected_qty),
    },
    {
      id: "counted",
      header: "Compté",
      width: "100px",
      align: "right",
      numeric: true,
      sortValue: (line) => line.counted_qty ?? -1,
      cell: (line) =>
        line.counted_qty == null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span title={line.first_count_qty != null ? `1er comptage : ${formatQuantity(line.first_count_qty)}` : undefined}>
            {formatQuantity(line.counted_qty)}
            {line.round > 1 ? <span className="ml-1 text-[10.5px] text-muted-foreground">({line.round}ᵉ)</span> : null}
          </span>
        ),
    },
    {
      id: "variance",
      header: "Écart",
      width: "90px",
      align: "right",
      numeric: true,
      sortValue: (line) => line.variance ?? 0,
      cell: (line) =>
        line.variance == null ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className={cn("font-medium", line.variance < 0 ? "text-destructive" : line.variance > 0 ? "text-emerald-700" : "text-muted-foreground")}>
            {signed(line.variance)}
          </span>
        ),
    },
    {
      id: "value",
      header: "Valeur",
      width: "120px",
      align: "right",
      numeric: true,
      hideBelow: "md",
      sortValue: (line) => line.variance_value ?? 0,
      cell: (line) => (line.variance_value ? formatMoney(line.variance_value) : <span className="text-muted-foreground">—</span>),
    },
    {
      id: "status",
      header: "Statut",
      width: "130px",
      hideBelow: "sm",
      sortValue: (line) => line.status,
      cell: (line) =>
        line.needs_recount ? (
          <StatusBadge size="sm" tone="danger">
            Écart à vérifier
          </StatusBadge>
        ) : (
          <StatusBadge size="sm" tone={lineStatusTone(line.status)}>
            {line.status}
          </StatusBadge>
        ),
    },
  ];

  if (!inventory) {
    return error ? (
      <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <AlertTriangle className="size-4 shrink-0" />
        {apiErrorMessage(error)}
      </p>
    ) : (
      <div className="grid min-h-80 place-items-center">
        <LoaderCircle className="size-7 animate-spin text-brand-600" />
      </div>
    );
  }

  const progress = inventory.progress;
  const countPath = `/inventaires/${encodeURIComponent(inventory.name)}/comptage`;

  return (
    <>
      <PageHeader
        eyebrow={inventory.name}
        title={inventory.titre}
        meta={<StatusBadge tone={inventoryStatusTone(inventory.status)}>{INVENTORY_STATUS_LABELS[inventory.status]}</StatusBadge>}
        description={scopeSummary(inventory)}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" nativeButton={false} render={<Link to="/inventaires" />}>
              <ArrowLeft /> Inventaires
            </Button>
            <Button variant="outline" onClick={refresh} disabled={isLoading}>
              {isLoading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
              Actualiser
            </Button>
            {inventory.status === "Brouillon" && canValidate ? (
              <Button disabled={busy} onClick={() => void run(() => api.startInventory(inventory.name), "Comptage lancé : stock théorique relevé.")}>
                {busy ? <Spinner /> : <Play />} Lancer le comptage
              </Button>
            ) : null}
            {canCount(inventory.status) ? (
              <Button nativeButton={false} render={<Link to={countPath} />}>
                <ScanBarcode /> Compter
              </Button>
            ) : null}
            {inventory.status === "En cours" && canValidate ? (
              <Button variant="outline" disabled={busy} onClick={() => void run(() => api.finishCounting(inventory.name), "Comptage clôturé.")}>
                <ClipboardCheck /> Clôturer le comptage
              </Button>
            ) : null}
            {inventory.status === "En revue" && canValidate ? (
              <Button variant="outline" disabled={busy} onClick={() => void run(() => api.reopenCounting(inventory.name), "Comptage rouvert.")}>
                <RotateCcw /> Rouvrir
              </Button>
            ) : null}
            {canReview(inventory.status) && canValidate ? (
              <Button disabled={busy || Boolean(progress?.to_recount)} onClick={() => setValidating(true)}>
                <CheckCircle2 /> Valider
              </Button>
            ) : null}
            {(inventory.status === "Brouillon" || canReview(inventory.status)) && canValidate ? (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  if (window.confirm("Annuler cet inventaire ? Aucun stock ne sera modifié.")) {
                    void run(() => api.cancelInventory(inventory.name), "Inventaire annulé.");
                  }
                }}
              >
                <XCircle /> Annuler
              </Button>
            ) : null}
          </div>
        }
      />

      {inventory.status === "Validé" ? (
        <p role="status" className="flex gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          <CheckCircle2 className="size-4 shrink-0" />
          Validé le {formatShortDate(inventory.validated_at?.slice(0, 10))}
          {inventory.stock_reconciliation ? ` · réconciliation de stock ${inventory.stock_reconciliation}` : " · aucun écart passé en stock"}
        </p>
      ) : null}
      {inventory.status === "En validation" ? (
        <p role="status" className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <LoaderCircle className="size-4 shrink-0 animate-spin" />
          Mise à jour du stock en cours en arrière-plan. Actualisez dans quelques instants.
        </p>
      ) : null}

      <section aria-label="Avancement" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiTile
          icon={ScanBarcode}
          tone={progress?.percent === 100 ? "success" : "info"}
          label="Lignes comptées"
          value={progress ? `${progress.counted}/${progress.total}` : "—"}
          hint={progress ? `${progress.percent} %` : undefined}
        />
        <KpiTile
          icon={RotateCcw}
          tone={progress?.to_recount ? "warning" : "neutral"}
          label="À recompter"
          value={progress ? progress.to_recount : "—"}
        />
        {canValidate ? (
          <>
            <KpiTile
              icon={AlertTriangle}
              tone={totals?.to_recount ? "danger" : "neutral"}
              label="Écarts au-delà du seuil"
              value={totals ? totals.to_recount : "—"}
              hint={totals ? `${totals.with_variance} ligne${totals.with_variance > 1 ? "s" : ""} avec écart` : undefined}
              onClick={() => setFilter("recount")}
            />
            <KpiTile
              icon={ClipboardCheck}
              tone={totals && totals.variance_value < 0 ? "danger" : "neutral"}
              label="Valeur des écarts"
              value={totals ? formatMoney(totals.variance_value) : "—"}
              hint={totals?.uncounted ? `${totals.uncounted} ligne${totals.uncounted > 1 ? "s" : ""} non comptée${totals.uncounted > 1 ? "s" : ""}` : undefined}
              onClick={() => setFilter("uncounted")}
            />
          </>
        ) : null}
      </section>

      {canValidate && inventory.status !== "Brouillon" ? (
        <>
          <Toolbar>
            <InputGroup className="min-w-48 flex-1 bg-background">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Article, entrepôt ou lot…"
                aria-label="Rechercher une ligne"
              />
            </InputGroup>
            <FilterSelect label="Lignes" value={filter} onChange={(value) => setFilter(value as ReviewFilter)} options={FILTER_OPTIONS} />
            {selected.length && canReview(inventory.status) ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void run(
                    () => api.requestRecount(inventory.name, selected),
                    `${selected.length} ligne${selected.length > 1 ? "s" : ""} à recompter.`,
                  )
                }
              >
                <RotateCcw /> Recompter ({selected.length})
              </Button>
            ) : null}
          </Toolbar>

          {review.error ? (
            <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
              <AlertTriangle className="size-4 shrink-0" />
              {apiErrorMessage(review.error)}
            </p>
          ) : null}

          <DataTable
            label="Écarts d’inventaire"
            columns={columns}
            rows={rows}
            rowKey={(line) => line.name}
            rowTone={(line) => (line.needs_recount ? "danger" : line.variance ? "warning" : undefined)}
            isLoading={review.isLoading && !lines.length}
            defaultSort={{ id: "value", direction: "asc" }}
            maxHeight="65vh"
            empty={
              <EmptyState
                icon={CheckCircle2}
                title={filter === "variance" ? "Aucun écart" : "Aucune ligne"}
                description={filter === "variance" ? "Toutes les lignes comptées correspondent au stock théorique." : "Modifiez la recherche ou le filtre."}
              />
            }
          />
        </>
      ) : null}

      {!canValidate && inventory.status !== "Brouillon" ? (
        <EmptyState
          icon={ScanBarcode}
          title={canCount(inventory.status) ? "Comptage ouvert" : "Comptage fermé"}
          description={
            canCount(inventory.status)
              ? "Ouvrez l’écran de comptage pour scanner les articles."
              : "Le responsable relit les écarts avant de mettre le stock à jour."
          }
          action={
            canCount(inventory.status) ? (
              <Button nativeButton={false} render={<Link to={countPath} />}>
                <ScanBarcode /> Compter
              </Button>
            ) : null
          }
        />
      ) : null}

      <Dialog open={validating} onOpenChange={setValidating}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Valider l’inventaire</DialogTitle>
            <DialogDescription>
              Les écarts sont passés en stock par une réconciliation ERPNext. Les mouvements faits depuis le comptage sont conservés.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="flex flex-col gap-3 text-[13px]">
            {totals ? (
              <ul className="grid gap-1">
                <li>
                  <strong className="num">{totals.with_variance}</strong> ligne{totals.with_variance > 1 ? "s" : ""} avec écart, pour{" "}
                  <strong>{formatMoney(totals.variance_value)}</strong>
                </li>
                <li>
                  <strong className="num">{totals.uncounted}</strong> ligne{totals.uncounted > 1 ? "s" : ""} non comptée
                  {totals.uncounted > 1 ? "s" : ""} ({formatMoney(totals.uncounted_value)} de stock théorique)
                </li>
                {totals.to_recount ? (
                  <li className="text-amber-800">
                    {totals.to_recount} écart{totals.to_recount > 1 ? "s" : ""} dépasse{totals.to_recount > 1 ? "nt" : ""} le seuil sans avoir été recompté
                    {totals.to_recount > 1 ? "s" : ""}.
                  </li>
                ) : null}
              </ul>
            ) : null}
            {totals?.uncounted ? (
              <label className="flex items-start gap-2">
                <Checkbox checked={zeroUncounted} onCheckedChange={(value) => setZeroUncounted(Boolean(value))} className="mt-0.5" />
                <span>
                  Mettre à zéro les lignes non comptées
                  <span className="block t-meta text-muted-foreground">
                    Sinon, leur stock reste inchangé (inventaire partiel).
                  </span>
                </span>
              </label>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setValidating(false)}>
              Annuler
            </Button>
            <Button onClick={() => void validate()} disabled={busy}>
              {busy ? <Spinner /> : <CheckCircle2 />} Valider et mettre à jour le stock
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
