import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ChevronLeft, ChevronRight, Plus, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { KpiTile } from "@/components/ui/kpi-tile";
import { Money } from "@/components/ui/money";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { DriverCashDialog } from "@/features/cashier/DriverCashDialog";
import {
  cashFlowTotals,
  cashState,
  cashStateTone,
  dayMonth,
  driverInitials,
  filterCashBoxes,
  MOVEMENT_FILTERS,
  movementMatches,
  parseCashSort,
  parseCashStates,
  plural,
  signedBalance,
  sortCashBoxes,
  type CashAdjustmentType,
} from "@/features/cashier/driverCashTotals";
import { preparationChipClass } from "@/features/preparation/PreparationQueueShell";
import { apiErrorMessage, useDistributionMutations, useDriverCashBox, useDriverCashBoxes } from "@/shared/api/distribution";
import { cashMovementTone, TONES } from "@/shared/design/statusTone";
import { formatDateTime, formatMoney, formatTime } from "@/shared/format";
import type { DriverCashMovement, DriverCashMovementType } from "@/shared/types/distribution";
import { cn } from "@/lib/utils";

const AVATAR: Record<string, string> = {
  "À remettre": "bg-amber-100 text-amber-800",
  "À zéro": "bg-slate-100 text-slate-600",
  Négatif: "bg-red-100 text-red-800",
  Inactif: "bg-slate-50 text-slate-400",
};

const TYPE_DOT: Record<string, string> = {
  Encaissement: "bg-emerald-500",
  Remise: "bg-amber-500",
  Avance: "bg-emerald-500",
  Ajustement: "bg-brand-600",
};

export function DriverCashBoxPage() {
  const { driver: encodedDriver = "" } = useParams();
  const driver = decodeURIComponent(encodedDriver);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const search = searchParams.get("q") || "";
  const states = useMemo(() => parseCashStates(searchParams.get("state")), [searchParams]);
  const sort = parseCashSort(searchParams.get("sort"));
  const listQuery = searchParams.toString();
  const listHref = listQuery ? `/caisses?${listQuery}` : "/caisses";

  const [movementTypes, setMovementTypes] = useState<Set<DriverCashMovementType>>(new Set());
  const [movementQuery, setMovementQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogType, setDialogType] = useState<CashAdjustmentType>("Remise");
  const [dialogAmount, setDialogAmount] = useState("");
  const [error, setError] = useState("");

  const { data: listData, error: listError, isLoading: listLoading, mutate: refreshList } = useDriverCashBoxes();
  const boxes = useMemo(
    () => sortCashBoxes(filterCashBoxes(listData?.message || [], states, search), sort),
    [listData?.message, search, sort, states],
  );
  const index = boxes.findIndex((box) => box.driver === driver);
  const { data, error: detailError, isLoading, mutate: refreshDetail } = useDriverCashBox(driver || undefined);
  const box = data?.message;
  const summary = (listData?.message || []).find((row) => row.driver === driver);
  const actions = useDistributionMutations();
  const state = box ? cashState(box) : summary ? cashState(summary) : "À zéro";
  const balance = box?.balance ?? summary?.balance ?? 0;
  const flow = useMemo(() => cashFlowTotals(box?.movements || []), [box?.movements]);
  const movements = useMemo(
    () => (box?.movements || []).filter((movement) => movementMatches(movement, movementTypes, movementQuery)),
    [box?.movements, movementQuery, movementTypes],
  );
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const type of MOVEMENT_FILTERS) counts[type] = 0;
    for (const movement of box?.movements || []) counts[movement.type] = (counts[movement.type] || 0) + 1;
    return counts;
  }, [box?.movements]);

  const openDialog = (type: CashAdjustmentType, amount: string) => {
    setDialogType(type);
    setDialogAmount(amount);
    setError("");
    setDialogOpen(true);
  };

  const go = (offset: number) => {
    const next = boxes[index + offset];
    if (!next) return;
    navigate(`/caisses/${encodeURIComponent(next.driver)}${listQuery ? `?${listQuery}` : ""}`);
  };

  const submit = async (payload: { type: CashAdjustmentType; amount: number; reason: string }) => {
    setError("");
    try {
      await actions.postDriverCashAdjustment({
        driver,
        type: payload.type,
        amount: payload.amount,
        reason: payload.reason,
      });
      toast.success(payload.type === "Remise" ? "Remise enregistrée. La caisse a été débitée." : `${payload.type} enregistré.`);
      setDialogOpen(false);
      await Promise.all([refreshList(), refreshDetail()]);
    } catch (submitError) {
      setError(apiErrorMessage(submitError));
    }
  };

  const columns: Array<DataTableColumn<DriverCashMovement>> = [
    {
      id: "date",
      header: "Date",
      width: "128px",
      cell: (movement) => (
        <div>
          <p className="num text-xs">{dayMonth(movement.date)}</p>
          <p className="num text-[10.5px] text-muted-foreground">{formatTime(movement.date)}</p>
        </div>
      ),
    },
    {
      id: "type",
      header: "Type",
      width: "118px",
      cell: (movement) => (
        <StatusBadge tone={cashMovementTone(movement.type)} size="sm">
          {movement.type}
        </StatusBadge>
      ),
    },
    {
      id: "reason",
      header: "Motif · tournée",
      width: "200px",
      cell: (movement) => (
        <div className="min-w-0">
          <p className="truncate text-[12.5px]">{movement.reason || "—"}</p>
          {movement.routeId ? (
            <Link
              to={`/planning/routes/${encodeURIComponent(movement.routeId)}`}
              className="num text-[11px] font-medium text-brand-700 hover:underline"
              onClick={(event) => event.stopPropagation()}
            >
              {movement.routeId}
            </Link>
          ) : null}
        </div>
      ),
    },
    {
      id: "amount",
      header: "Montant",
      width: "128px",
      align: "right",
      numeric: true,
      cell: (movement) => (
        <span className={cn("num text-[13px] font-medium", movement.amount < 0 ? "text-red-700" : "text-emerald-700")}>
          {signedBalance(movement.amount)}
        </span>
      ),
    },
    {
      id: "balance",
      header: "Solde après",
      width: "132px",
      align: "right",
      numeric: true,
      cell: (movement) => <Money value={movement.balanceAfter} precise signed className="text-[12px] text-muted-foreground" />,
    },
  ];

  const pending = box?.pendingControlAmount;
  const driverName = box?.driverName || summary?.driverName || driver;

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-4">
        <Button variant="outline" size="sm" onClick={() => navigate(listHref)}>
          <ChevronLeft />
          Toutes les caisses
        </Button>
        <div className="flex items-center gap-2">
          <span className="num text-xs text-muted-foreground">
            {index >= 0 ? `${index + 1} / ${boxes.length}` : `— / ${boxes.length}`}
          </span>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Caisse précédente" disabled={index <= 0} onClick={() => go(-1)}>
            <ChevronLeft />
          </Button>
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Caisse suivante" disabled={index < 0 || index >= boxes.length - 1} onClick={() => go(1)}>
            <ChevronRight />
          </Button>
          <Button variant="outline" size="sm" onClick={() => void Promise.all([refreshList(), refreshDetail()])} disabled={listLoading || isLoading}>
            <RefreshCw />
            Actualiser
          </Button>
          <Button size="sm" onClick={() => openDialog("Remise", "")}>
            <Plus />
            Mouvement
          </Button>
        </div>
      </div>

      {(listError || detailError) && (
        <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          {apiErrorMessage(listError || detailError)}
        </p>
      )}

      {isLoading && !box ? <Skeleton className="h-36 w-full rounded-lg" /> : null}

      {box || summary ? (
        <section className={cn("rounded-lg border border-hairline bg-card p-5 shadow-card", balance < 0 && "border-red-200 bg-red-50")}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <span className={cn("grid size-[42px] shrink-0 place-items-center rounded-full text-sm font-semibold", AVATAR[state])}>
                {driverInitials(driverName)}
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-[20px] font-semibold tracking-tight">{driverName}</h1>
                  <StatusBadge tone={cashStateTone(state)} size="sm">
                    {state}
                  </StatusBadge>
                </div>
                <p className="num mt-1 text-[12.5px] text-muted-foreground">
                  {driver} · dernière mise à jour {formatDateTime(box?.updatedAt || summary?.updatedAt)}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="num t-micro text-muted-foreground">Solde actuel</p>
              <p className={cn("num mt-1 text-[30px] font-semibold tracking-tight", balance < 0 && "text-red-700")}>
                {signedBalance(balance)}
              </p>
              {balance > 0 ? (
                <div className="mt-3 flex flex-wrap justify-end">
                  <Button size="sm" onClick={() => openDialog("Remise", String(balance))}>
                    Remettre {formatMoney(balance, { precise: true })}
                  </Button>
                </div>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiTile
          tone="success"
          label={`Encaissé (${flow.windowDays} j)`}
          value={formatMoney(flow.collected, { precise: true })}
          hint={`${plural(flow.collectedCount, "encaissement", "encaissements")} en tournée`}
        />
        <KpiTile
          label={`Remis (${flow.windowDays} j)`}
          value={formatMoney(flow.handedOver, { precise: true })}
          hint={`${plural(flow.handedOverCount, "remise", "remises")} validée${flow.handedOverCount > 1 ? "s" : ""}`}
        />
        <KpiTile
          tone={flow.adjustments < 0 ? "danger" : "neutral"}
          label="Ajustements"
          value={signedBalance(flow.adjustments)}
          hint="avances et écarts arbitrés"
        />
        {pending == null ? (
          <KpiTile
            label="Caisse à contrôler"
            value="—"
            hint={
              <Link to="/cashier" className="font-medium text-brand-700 hover:underline">
                Ouvrir le contrôle de caisse →
              </Link>
            }
          />
        ) : (
          <KpiTile
            tone={pending > 0 ? "warning" : "neutral"}
            label="Caisse à contrôler"
            value={formatMoney(pending, { precise: true })}
            hint={
              pending > 0 ? (
                <Link to="/cashier" className="font-medium text-brand-700 hover:underline">
                  Ouvrir le contrôle de caisse →
                </Link>
              ) : (
                "Rien en attente de contrôle"
              )
            }
          />
        )}
      </section>

      <Card className="overflow-hidden py-0">
        <CardHeader className="flex flex-row flex-wrap items-center gap-2 py-2.5">
          <div className="flex items-center gap-2">
            <CardTitle>Historique</CardTitle>
            <span className="num shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{movements.length}</span>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {MOVEMENT_FILTERS.map((type) => {
              const active = movementTypes.has(type);
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={active}
                  className={preparationChipClass(active)}
                  onClick={() => {
                    const next = new Set(movementTypes);
                    if (next.has(type)) next.delete(type);
                    else next.add(type);
                    setMovementTypes(next);
                  }}
                >
                  <span className={cn("size-1.5 rounded-full", TYPE_DOT[type] || TONES[cashMovementTone(type)].dot)} />
                  {type}
                  <span className="num text-[11px] opacity-70">{typeCounts[type] || 0}</span>
                </button>
              );
            })}
            <InputGroup className="h-8 w-52 bg-background">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                value={movementQuery}
                onChange={(event) => setMovementQuery(event.target.value)}
                placeholder="Motif ou tournée…"
                aria-label="Filtrer l’historique"
              />
            </InputGroup>
          </div>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <div className="overflow-x-auto">
            <div className="min-w-[780px]">
              <DataTable
                className="rounded-none border-0 border-t"
                label={`Mouvements de caisse de ${driverName}`}
                columns={columns}
                rows={movements}
                rowKey={(movement) => movement.name}
                isLoading={isLoading && !box}
                empty={
                  <p className="py-8 text-center t-body text-muted-foreground">
                    {(box?.movements || []).length ? "Aucun mouvement ne correspond au filtre." : "Aucun mouvement pour l'instant."}
                  </p>
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <DriverCashDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setError("");
        }}
        driverName={driverName}
        currentBalance={balance}
        defaultType={dialogType}
        defaultAmount={dialogAmount}
        submitting={actions.driverCash}
        error={error}
        onSubmit={submit}
      />
    </>
  );
}

export default DriverCashBoxPage;
