import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, RefreshCw, RotateCcw, Search, Wallet } from "lucide-react";
import { FilterSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { KpiTile } from "@/components/ui/kpi-tile";
import { PageHeader } from "@/components/ui/page-header";
import { Toolbar, ToolbarSpacer } from "@/components/ui/toolbar";
import { driverCashColumns, driverCashFooter } from "@/features/cashier/driverCashColumns";
import { DriverCashDialog } from "@/features/cashier/DriverCashDialog";
import {
  CASH_STATES,
  cashState,
  cashStateCounts,
  cashStateTone,
  displayedBalanceTotal,
  driverCashListKpis,
  filterCashBoxes,
  parseCashSort,
  parseCashStates,
  plural,
  signedBalance,
  sortCashBoxes,
  type CashAdjustmentType,
  type CashSort,
  type CashState,
} from "@/features/cashier/driverCashTotals";
import { preparationChipClass } from "@/features/preparation/PreparationQueueShell";
import { apiErrorMessage, useDistributionMutations, useDriverCashBoxes } from "@/shared/api/distribution";
import { TONES } from "@/shared/design/statusTone";
import { formatMoney } from "@/shared/format";
import type { DriverCashBox } from "@/shared/types/distribution";
import { cn } from "@/lib/utils";

const STATE_DOT: Record<CashState, string> = {
  "À remettre": "bg-amber-500",
  "À zéro": "bg-slate-400",
  Négatif: "bg-red-500",
  Inactif: "bg-slate-300",
};

const SORT_OPTIONS = [
  { value: "balance", label: "Solde décroissant" },
  { value: "name", label: "Nom A → Z" },
  { value: "updated", label: "Mouvement le plus récent" },
];

export function DriverCashPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(() => searchParams.get("q") || "");
  const [states, setStates] = useState(() => parseCashStates(searchParams.get("state")));
  const [sort, setSort] = useState<CashSort>(() => parseCashSort(searchParams.get("sort")));
  const [dialog, setDialog] = useState<{ driver: string; type: CashAdjustmentType; amount: string } | null>(null);
  const [error, setError] = useState("");
  const { data: listData, error: listError, isLoading: listLoading, mutate: refreshList } = useDriverCashBoxes();
  const boxes = useMemo(() => listData?.message || [], [listData?.message]);
  const actions = useDistributionMutations();
  const kpis = useMemo(() => driverCashListKpis(boxes), [boxes]);
  const counts = useMemo(() => cashStateCounts(boxes), [boxes]);
  const filtered = useMemo(
    () => sortCashBoxes(filterCashBoxes(boxes, states, search), sort),
    [boxes, search, sort, states],
  );
  const columns = useMemo(
    () =>
      driverCashColumns((box) => {
        setError("");
        setDialog({ driver: box.driver, type: "Remise", amount: String(box.balance) });
      }),
    [],
  );
  const dialogBox = boxes.find((box) => box.driver === dialog?.driver);
  const filtersActive = Boolean(search || states.size || sort !== "balance");
  const listSearch = (overrides: Record<string, string> = {}) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if (states.size) params.set("state", [...states].join("|"));
    if (sort !== "balance") params.set("sort", sort);
    for (const [key, value] of Object.entries(overrides)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const encoded = params.toString();
    return encoded ? `?${encoded}` : "";
  };

  const syncParams = (next: { q?: string; states?: Set<CashState>; sort?: CashSort }) => {
    const q = next.q ?? search;
    const stateSet = next.states ?? states;
    const sortValue = next.sort ?? sort;
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (stateSet.size) params.set("state", [...stateSet].join("|"));
    if (sortValue !== "balance") params.set("sort", sortValue);
    setSearchParams(params, { replace: true });
  };

  const toggleState = (state: CashState) => {
    const next = new Set(states);
    if (next.has(state)) next.delete(state);
    else next.add(state);
    setStates(next);
    syncParams({ states: next });
  };

  const openBox = (box: DriverCashBox) => {
    navigate(`/caisses/${encodeURIComponent(box.driver)}${listSearch()}`);
  };

  const submit = async (payload: { type: CashAdjustmentType; amount: number; reason: string }) => {
    if (!dialog) return;
    setError("");
    try {
      await actions.postDriverCashAdjustment({
        driver: dialog.driver,
        type: payload.type,
        amount: payload.amount,
        reason: payload.reason,
      });
      toast.success(payload.type === "Remise" ? "Remise enregistrée. La caisse a été débitée." : `${payload.type} enregistré.`);
      setDialog(null);
      await refreshList();
    } catch (submitError) {
      setError(apiErrorMessage(submitError));
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Fonds livreurs"
        title="Caisses des livreurs"
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
              <span className="size-1.5 rounded-full bg-emerald-500" aria-hidden />
              Live · 15 s
            </span>
            {kpis.negativeCount ? (
              <button
                type="button"
                onClick={() => {
                  const next = new Set<CashState>(["Négatif"]);
                  setStates(next);
                  syncParams({ states: next });
                }}
                className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700"
              >
                <span className="size-1.5 rounded-full bg-red-500" />
                {kpis.negativeCount} en découvert
              </button>
            ) : null}
          </div>
        }
        actions={
          <Button variant="outline" onClick={() => void refreshList()} disabled={listLoading}>
            <RefreshCw />
            Actualiser
          </Button>
        }
      />

      {listError ? (
        <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          {apiErrorMessage(listError)}
        </p>
      ) : null}

      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiTile
          tone="info"
          label="Encaisse en circulation"
          value={listLoading && !boxes.length ? "—" : formatMoney(kpis.circulation, { precise: true })}
          hint={`${plural(kpis.openCount, "caisse ouverte", "caisses ouvertes")} · hors caisses inactives`}
        />
        <KpiTile
          tone={kpis.toHandoverCount ? "warning" : "neutral"}
          label="À remettre"
          value={listLoading && !boxes.length ? "—" : formatMoney(kpis.toHandoverAmount, { precise: true })}
          hint={kpis.toHandoverCount ? `${plural(kpis.toHandoverCount, "caisse", "caisses")} à vider` : "Aucune caisse à vider"}
          onClick={() => {
            const next = new Set<CashState>(["À remettre"]);
            setStates(next);
            syncParams({ states: next });
          }}
          className={kpis.toHandoverCount ? TONES.warning.surface : undefined}
        />
        <KpiTile
          tone={kpis.negativeCount ? "danger" : "neutral"}
          label="Soldes négatifs"
          value={listLoading && !boxes.length ? "—" : signedBalance(kpis.negativeAmount)}
          hint={kpis.negativeCount ? `${kpis.negativeCount} à régulariser · motif obligatoire` : "Aucun découvert"}
          onClick={() => {
            const next = new Set<CashState>(["Négatif"]);
            setStates(next);
            syncParams({ states: next });
          }}
          className={kpis.negativeCount ? TONES.danger.surface : undefined}
        />
        <KpiTile
          label="Caisses ouvertes"
          value={listLoading && !boxes.length ? "—" : `${kpis.openCount} livreurs`}
          hint={`${plural(kpis.inactiveCount, "caisse", "caisses")} inactive${kpis.inactiveCount > 1 ? "s" : ""} masquée${kpis.inactiveCount > 1 ? "s" : ""} par défaut`}
        />
      </section>

      <Toolbar>
        <InputGroup className="h-8 w-64 min-w-48 bg-background">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              syncParams({ q: event.target.value });
            }}
            placeholder="Nom ou code livreur…"
            aria-label="Rechercher un livreur"
          />
        </InputGroup>
        {CASH_STATES.map((state) => {
          const active = states.has(state);
          return (
            <button
              key={state}
              type="button"
              aria-pressed={active}
              className={preparationChipClass(active)}
              onClick={() => toggleState(state)}
            >
              <span className={cn("size-1.5 rounded-full", STATE_DOT[state] || TONES[cashStateTone(state)].dot)} />
              {state}
              <span className="num text-[11px] opacity-70">{counts[state] || 0}</span>
            </button>
          );
        })}
        <FilterSelect
          label="Tri"
          value={sort}
          onChange={(value) => {
            const next = parseCashSort(value);
            setSort(next);
            syncParams({ sort: next });
          }}
          options={SORT_OPTIONS}
        />
        <ToolbarSpacer />
        <span className="num text-[11px] text-muted-foreground">
          {filtered.length} / {boxes.length} caisses
        </span>
        {filtersActive ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch("");
              setStates(new Set());
              setSort("balance");
              syncParams({ q: "", states: new Set(), sort: "balance" });
            }}
          >
            <RotateCcw />
            Réinitialiser
          </Button>
        ) : null}
      </Toolbar>

      {!listLoading && boxes.length === 0 ? (
        <div className="rounded-lg border border-dashed border-hairline-strong bg-card">
          <EmptyState icon={Wallet} title="Aucune caisse livreur" description="Les caisses sont créées automatiquement pour chaque livreur." />
        </div>
      ) : (
        <Card className="overflow-hidden py-0">
          <CardHeader className="flex-row flex-wrap items-center gap-2 py-2.5">
            <CardTitle>Caisses</CardTitle>
            <span className="num rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{filtered.length}</span>
            <p className="ml-auto t-body text-muted-foreground">Cliquez une ligne pour ouvrir la caisse et son historique.</p>
          </CardHeader>
          <CardContent className="px-0 pb-0">
            <div className="overflow-x-auto">
              <div className="min-w-[824px]">
                <DataTable
                  className="rounded-none border-0 border-t"
                  label="Caisses des livreurs"
                  columns={columns}
                  rows={filtered}
                  rowKey={(box) => box.driver}
                  rowTone={(box) => cashStateTone(cashState(box))}
                  rowClassName={(box) => (box.active === false ? "opacity-[0.62]" : undefined)}
                  onRowClick={openBox}
                  isLoading={listLoading}
                  footer={filtered.length ? driverCashFooter(displayedBalanceTotal(filtered)) : undefined}
                  empty={
                    <EmptyState
                      icon={Wallet}
                      title="Aucune caisse ne correspond"
                      description="Retirez les filtres. Les caisses sont créées automatiquement pour chaque livreur."
                    />
                  }
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <DriverCashDialog
        open={Boolean(dialog)}
        onOpenChange={(open) => {
          if (!open) {
            setDialog(null);
            setError("");
          }
        }}
        driverName={dialogBox?.driverName || dialog?.driver || ""}
        currentBalance={dialogBox?.balance ?? 0}
        defaultType={dialog?.type || "Remise"}
        defaultAmount={dialog?.amount || ""}
        submitting={actions.driverCash}
        error={error}
        onSubmit={submit}
      />
    </>
  );
}

export default DriverCashPage;
