import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  LoaderCircle,
  Plus,
  RefreshCw,
  Search,
  Users,
  Wallet,
} from "lucide-react";
import { FilterSelect, FormSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { KpiTile } from "@/components/ui/kpi-tile";
import { Money } from "@/components/ui/money";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { Toolbar } from "@/components/ui/toolbar";
import { apiErrorMessage, useDistributionMutations, useDriverCashBox, useDriverCashBoxes } from "@/shared/api/distribution";
import { cashBalanceTone, cashMovementTone } from "@/shared/design/statusTone";
import { formatDateTime, formatMoney } from "@/shared/format";
import { cn } from "@/lib/utils";
import type { DriverCashAdjustmentInput, DriverCashBox, DriverCashMovement, DriverCashMovementType } from "@/shared/types/distribution";

const adjustmentTypes: Array<DriverCashAdjustmentInput["type"]> = ["Remise", "Avance", "Ajustement"];
const movementFilters: Array<DriverCashMovementType | ""> = ["", "Encaissement", "Remise", "Avance", "Ajustement", "Retour tournée"];

type CashFocus = "all" | "positive" | "negative" | "inactive";

function isActiveBox(box: DriverCashBox) {
  return box.active !== false;
}

function matchesFocus(box: DriverCashBox, focus: CashFocus) {
  if (focus === "positive") return box.balance > 0;
  if (focus === "negative") return box.balance < 0;
  if (focus === "inactive") return !isActiveBox(box);
  return isActiveBox(box);
}

function matchesSearch(box: DriverCashBox, query: string) {
  if (!query) return true;
  return [box.driverName, box.driver, box.name]
    .filter(Boolean)
    .some((value) => value.toLocaleLowerCase("fr").includes(query));
}

function signedAdjustment(type: DriverCashAdjustmentInput["type"], amount: number) {
  if (type === "Remise") return -Math.abs(amount);
  if (type === "Avance") return Math.abs(amount);
  return amount;
}

function balanceLabel(balance: number) {
  if (balance < 0) return "Négatif";
  if (balance > 0) return "À remettre";
  return "À zéro";
}

function DriverCashSkeleton() {
  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]" aria-hidden="true">
      <div className="space-y-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-[92px] w-full rounded-lg" />
        ))}
      </div>
      <div className="space-y-4">
        <Skeleton className="h-36 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    </div>
  );
}

export function DriverCashPage({ canAdjust = false }: { canAdjust?: boolean }) {
  const [selected, setSelected] = useState("");
  const [search, setSearch] = useState("");
  const [focus, setFocus] = useState<CashFocus>("all");
  const [movementType, setMovementType] = useState<DriverCashMovementType | "">("");
  const [movementQuery, setMovementQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [type, setType] = useState<DriverCashAdjustmentInput["type"]>("Remise");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const { data: listData, error: listError, isLoading: listLoading, mutate: refreshList } = useDriverCashBoxes();
  const boxes = useMemo(() => listData?.message || [], [listData?.message]);
  const { data, error: detailError, isLoading: detailLoading, mutate: refreshDetail } = useDriverCashBox(selected || undefined);
  const box = data?.message;
  const actions = useDistributionMutations();
  const query = search.trim().toLocaleLowerCase("fr");

  const totals = useMemo(() => {
    const positive = boxes.filter((row) => row.balance > 0);
    const negative = boxes.filter((row) => row.balance < 0);
    return {
      float: boxes.reduce((sum, row) => sum + row.balance, 0),
      toHandover: positive.length,
      toHandoverAmount: positive.reduce((sum, row) => sum + row.balance, 0),
      negative: negative.length,
      negativeAmount: negative.reduce((sum, row) => sum + row.balance, 0),
      active: boxes.filter(isActiveBox).length,
    };
  }, [boxes]);

  const filtered = useMemo(
    () => boxes.filter((row) => matchesFocus(row, focus) && matchesSearch(row, query)),
    [boxes, focus, query],
  );

  useEffect(() => {
    if (filtered.length && !filtered.some((row) => row.driver === selected)) setSelected(filtered[0].driver);
    if (!filtered.length) setSelected("");
  }, [filtered, selected]);

  const selectedSummary = boxes.find((row) => row.driver === selected);
  const parsedAmount = Number(amount || 0);
  const previewDelta = signedAdjustment(type, parsedAmount);
  const previewBalance = (box?.balance ?? selectedSummary?.balance ?? 0) + previewDelta;
  const canSubmit = Boolean(reason.trim()) && Math.abs(parsedAmount) > 0.000001 && !actions.driverCash;

  const movements = useMemo(() => {
    const source = box?.movements || [];
    const haystack = movementQuery.trim().toLocaleLowerCase("fr");
    return source.filter((movement) => {
      if (movementType && movement.type !== movementType) return false;
      if (!haystack) return true;
      return [movement.type, movement.reason, movement.routeId, movement.name]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("fr").includes(haystack));
    });
  }, [box?.movements, movementQuery, movementType]);

  const openDialog = () => {
    setType("Remise");
    setAmount("");
    setReason("");
    setError("");
    setDialogOpen(true);
  };

  const submit = async () => {
    if (!selected || !canSubmit) return;
    setError("");
    try {
      await actions.postDriverCashAdjustment({
        driver: selected,
        type,
        amount: parsedAmount,
        reason: reason.trim(),
      });
      toast.success(type === "Remise" ? "Remise enregistrée. La caisse a été débitée." : `${type} enregistré.`);
      setDialogOpen(false);
      setAmount("");
      setReason("");
      await Promise.all([refreshList(), refreshDetail()]);
    } catch (submitError) {
      setError(apiErrorMessage(submitError));
    }
  };

  const movementColumns: Array<DataTableColumn<DriverCashMovement>> = [
    {
      id: "type",
      header: "Mouvement",
      sortValue: (movement) => movement.type,
      cell: (movement) => (
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={cashMovementTone(movement.type)} size="sm">
              {movement.type}
            </StatusBadge>
            {movement.routeId &&
              (canAdjust ? (
                <Link
                  to={`/planning/routes/${encodeURIComponent(movement.routeId)}`}
                  className="num t-meta font-medium text-brand-700 hover:underline"
                >
                  {movement.routeId}
                </Link>
              ) : (
                <span className="num t-meta text-muted-foreground">{movement.routeId}</span>
              ))}
          </div>
          <p className="num mt-1 truncate t-meta text-muted-foreground">{formatDateTime(movement.date)}</p>
          {movement.reason && <p className="mt-0.5 t-meta text-slate-600">{movement.reason}</p>}
        </div>
      ),
    },
    {
      id: "amount",
      header: "Montant",
      width: "150px",
      align: "right",
      numeric: true,
      sortValue: (movement) => movement.amount,
      cell: (movement) => (
        <Money
          value={movement.amount}
          precise
          className={`font-semibold ${movement.amount < 0 ? "text-red-700" : "text-emerald-700"}`}
        />
      ),
    },
    {
      id: "balance",
      header: "Solde après",
      width: "150px",
      align: "right",
      numeric: true,
      hideBelow: "sm",
      sortValue: (movement) => movement.balanceAfter,
      cell: (movement) => <Money value={movement.balanceAfter} precise signed className="text-muted-foreground" />,
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Fonds livreurs"
        title="Caisses des livreurs"
        description="Solde permanent par livreur. Les encaissements s’y ajoutent en tournée ; la validation de caisse vide la caisse. Un responsable peut ajouter ou retirer des fonds avec un motif."
        meta={
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
            <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
            Live 15 s
          </span>
        }
        actions={
          <Button
            variant="outline"
            onClick={() => void Promise.all([refreshList(), selected ? refreshDetail() : Promise.resolve()])}
            disabled={listLoading}
          >
            {listLoading ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
            Actualiser
          </Button>
        }
      />

      <section aria-label="Indicateurs des caisses" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          icon={Wallet}
          tone="info"
          label="Encaisse totale"
          value={listLoading && !boxes.length ? "—" : formatMoney(totals.float, { precise: true })}
          hint="Tous les soldes →"
          onClick={() => setFocus("all")}
          className={focus === "all" ? "border-brand-300 bg-brand-50/50" : undefined}
        />
        <KpiTile
          icon={ArrowUpRight}
          tone={totals.toHandover ? "warning" : "neutral"}
          label="À remettre"
          value={listLoading && !boxes.length ? "—" : totals.toHandover}
          hint={totals.toHandover ? `${formatMoney(totals.toHandoverAmount, { precise: true })} en circulation →` : "Aucune caisse à vider →"}
          onClick={() => setFocus("positive")}
          className={focus === "positive" ? "border-brand-300 bg-brand-50/50" : undefined}
        />
        <KpiTile
          icon={ArrowDownLeft}
          tone={totals.negative ? "danger" : "neutral"}
          label="Soldes négatifs"
          value={listLoading && !boxes.length ? "—" : totals.negative}
          hint={totals.negative ? `${formatMoney(totals.negativeAmount, { precise: true })} à régulariser →` : "Aucun découvert →"}
          onClick={() => setFocus("negative")}
          className={focus === "negative" ? "border-brand-300 bg-brand-50/50" : undefined}
        />
        <KpiTile
          icon={Users}
          tone="success"
          label="Livreurs actifs"
          value={listLoading && !boxes.length ? "—" : totals.active}
          hint="Caisses ouvertes →"
          onClick={() => setFocus("all")}
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
            placeholder="Nom ou code livreur…"
            aria-label="Rechercher un livreur"
          />
        </InputGroup>
        <FilterSelect
          label="État"
          value={focus}
          onChange={(value) => setFocus(value as CashFocus)}
          options={[
            { value: "all", label: "Tous (actifs)" },
            { value: "positive", label: "À remettre" },
            { value: "negative", label: "Négatif" },
            { value: "inactive", label: "Inactifs" },
          ]}
        />
      </Toolbar>

      {(listError || detailError) && (
        <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          {apiErrorMessage(listError || detailError)}
        </p>
      )}

      {listLoading && !boxes.length && <DriverCashSkeleton />}

      {!listLoading && boxes.length === 0 && (
        <div className="rounded-lg border border-dashed border-hairline-strong bg-card">
          <EmptyState
            icon={Wallet}
            title="Aucune caisse livreur"
            description="Les caisses sont créées automatiquement pour chaque livreur."
          />
        </div>
      )}

      {boxes.length > 0 && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:items-start">
          <section className="space-y-2 lg:max-h-[calc(100vh-18rem)] lg:overflow-y-auto lg:pr-1">
            {filtered.map((row) => {
              const active = row.driver === selected;
              const inactive = !isActiveBox(row);
              return (
                <button
                  key={row.driver}
                  type="button"
                  onClick={() => {
                    setSelected(row.driver);
                    setError("");
                  }}
                  aria-pressed={active}
                  className={cn(
                    "w-full rounded-lg border p-4 text-left shadow-card transition-colors",
                    active ? "border-brand-300 bg-brand-50" : "border-hairline bg-card hover:border-hairline-strong",
                    inactive && "opacity-70",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="t-section text-foreground">{row.driverName}</p>
                      <p className="truncate t-meta text-muted-foreground">{row.driver}</p>
                    </div>
                    <StatusBadge tone={cashBalanceTone(row.balance)} size="sm">
                      {balanceLabel(row.balance)}
                    </StatusBadge>
                  </div>
                  <Money value={row.balance} precise signed className="mt-3 block text-lg font-semibold" />
                </button>
              );
            })}
            {!filtered.length && (
              <p className="rounded-lg border border-dashed border-hairline-strong bg-card p-4 t-body text-muted-foreground">
                Aucune caisse ne correspond à la recherche.
              </p>
            )}
          </section>

          <section className="space-y-4">
            {detailLoading && !box && (
              <div className="space-y-4" aria-hidden="true">
                <Skeleton className="h-36 w-full rounded-lg" />
                <Skeleton className="h-64 w-full rounded-lg" />
              </div>
            )}
            {box && (
              <>
                <Card className={`p-5 ${box.balance < 0 ? "border-red-200 bg-red-50" : ""}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="t-micro text-muted-foreground">Solde actuel</p>
                      <h2 className="mt-1 t-display">{box.driverName}</h2>
                    </div>
                    {canAdjust && (
                      <Button onClick={openDialog}>
                        <Plus />
                        Nouveau mouvement
                      </Button>
                    )}
                  </div>
                  <Money value={box.balance} precise signed className="mt-3 block text-3xl font-semibold tracking-tight" />
                  <p className="num mt-2 t-meta text-muted-foreground">
                    Dernière mise à jour {formatDateTime(box.updatedAt || selectedSummary?.updatedAt)}
                  </p>
                </Card>

                <section className="space-y-3">
                  <div className="flex flex-wrap items-end justify-between gap-3">
                    <h3 className="t-section">Historique</h3>
                    <div className="flex flex-wrap items-end gap-2">
                      <label className="flex min-w-40 flex-col gap-1">
                        <span className="t-micro text-muted-foreground">Type</span>
                        <FormSelect
                          aria-label="Type de mouvement"
                          value={movementType || "all"}
                          onChange={(value) => setMovementType(value === "all" ? "" : (value as DriverCashMovementType))}
                          options={movementFilters.map((option) => ({
                            value: option || "all",
                            label: option || "Tous",
                          }))}
                        />
                      </label>
                      <label className="flex min-w-48 flex-col gap-1">
                        <span className="t-micro text-muted-foreground">Filtrer</span>
                        <Input
                          value={movementQuery}
                          onChange={(event) => setMovementQuery(event.target.value)}
                          placeholder="Motif ou tournée…"
                          aria-label="Filtrer l’historique"
                        />
                      </label>
                    </div>
                  </div>
                  <DataTable
                    label={`Mouvements de caisse de ${box.driverName}`}
                    columns={movementColumns}
                    rows={movements}
                    rowKey={(movement) => movement.name}
                    rowTone={(movement) => cashMovementTone(movement.type)}
                    maxHeight="max-h-[50vh]"
                    empty={
                      <p className="py-8 text-center t-body text-muted-foreground">
                        {(box.movements || []).length
                          ? "Aucun mouvement ne correspond au filtre."
                          : "Aucun mouvement pour l’instant."}
                      </p>
                    }
                  />
                </section>
              </>
            )}
          </section>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <DialogHeader>
              <DialogTitle>Mouvement manuel</DialogTitle>
              <DialogDescription>
                Une remise diminue le solde, une avance l’augmente. Un ajustement accepte un montant signé. Le motif est obligatoire.
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-3">
              {error && (
                <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  <AlertTriangle className="size-4 shrink-0" />
                  {error}
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="t-micro text-muted-foreground">Type</span>
                  <FormSelect
                    value={type}
                    onChange={(value) => setType(value as DriverCashAdjustmentInput["type"])}
                    options={adjustmentTypes.map((option) => ({ value: option, label: option }))}
                  />
                </label>
                <label className="flex flex-col gap-1.5">
                  <span className="t-micro text-muted-foreground">Montant</span>
                  <Input
                    type="number"
                    step="0.01"
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    className="num"
                  />
                </label>
              </div>
              <label className="flex flex-col gap-1.5">
                <span className="t-micro text-muted-foreground">Motif</span>
                <Textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Expliquez le mouvement…"
                />
              </label>
              {amount !== "" && (
                <p className="rounded-md bg-surface-subtle p-3 t-body text-muted-foreground">
                  Le solde passera de{" "}
                  <Money value={box?.balance ?? 0} precise signed className="font-semibold text-foreground" /> à{" "}
                  <Money value={previewBalance} precise signed className="font-semibold text-foreground" />
                  {previewDelta !== 0 && (
                    <>
                      {" "}
                      ({previewDelta > 0 ? "+" : ""}
                      <Money value={previewDelta} precise className="font-semibold text-foreground" />)
                    </>
                  )}
                  .
                </p>
              )}
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)} disabled={actions.driverCash}>
                Annuler
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {actions.driverCash ? <LoaderCircle className="animate-spin" /> : <Check />}
                Enregistrer
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default DriverCashPage;
