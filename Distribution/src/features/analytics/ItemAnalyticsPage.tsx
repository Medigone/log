import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  Boxes,
  Download,
  Gauge,
  HandCoins,
  LoaderCircle,
  RefreshCw,
  Search,
  TrendingUp,
  TriangleAlert,
  X,
} from "lucide-react";
import { DateRangeFilter } from "@/components/DateRangeFilter";
import { FilterSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { KpiTile } from "@/components/ui/kpi-tile";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toolbar } from "@/components/ui/toolbar";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/shared/api/distribution";
import { useItemAnalytics, type AbcClass, type ItemAnalyticsData, type ItemAnalyticsRow, type Quadrant } from "@/shared/api/analytics";
import { formatMoney, formatShortDate } from "@/shared/format";
import { CustomerAnalyticsTable } from "@/features/analytics/CustomerAnalyticsTable";
import { DecisionPanel } from "@/features/analytics/DecisionPanel";
import { ItemAnalyticsTable } from "@/features/analytics/ItemAnalyticsTable";
import {
  ABC_HINTS,
  ALERT_LABELS,
  deltaTone,
  downloadCsv,
  EMPTY_FILTERS,
  filterItems,
  formatDelta,
  formatPercent,
  formatRatio,
  itemsCsv,
  OPPORTUNITIES,
  PERIOD_PRESETS,
  presetRange,
  QUADRANTS,
  type AlertFilter,
  type ItemFilters,
  type PeriodPreset,
} from "@/features/analytics/analyticsShared";

type Tab = "decisions" | "articles" | "clients";

const QUADRANT_OPTIONS = [
  { value: "", label: "Tous les quadrants" },
  ...(Object.keys(QUADRANTS) as Quadrant[]).map((value) => ({ value, label: QUADRANTS[value].label })),
];
const ABC_OPTIONS = [
  { value: "", label: "Toutes les classes" },
  ...(["A", "B", "C"] as AbcClass[]).map((value) => ({ value, label: `${value} · ${ABC_HINTS[value]}` })),
];
const ALERT_OPTIONS = [
  { value: "", label: "Toutes" },
  { value: "any", label: "Avec alerte" },
  ...(Object.keys(ALERT_LABELS) as Array<keyof typeof ALERT_LABELS>).map((value) => ({ value, label: ALERT_LABELS[value] })),
];

function namesToOptions(names: string[] | undefined, allLabel: string) {
  return [{ value: "", label: allLabel }, ...(names ?? []).map((name) => ({ value: name, label: name }))];
}

export function ItemAnalyticsPage() {
  const [preset, setPreset] = useState<PeriodPreset>("90");
  const [range, setRange] = useState(() => presetRange("90"));
  const [draftRange, setDraftRange] = useState(range);
  const [itemGroup, setItemGroup] = useState("");
  const [brand, setBrand] = useState("");
  const [customer, setCustomer] = useState("");
  const [tab, setTab] = useState<Tab>("decisions");
  const [filters, setFilters] = useState<ItemFilters>(EMPTY_FILTERS);
  const [expanded, setExpanded] = useState<string | null>(null);

  const query = { fromDate: range.from, toDate: range.to, itemGroup, brand, customer };
  const { data, error, isLoading, isValidating, mutate } = useItemAnalytics(query);
  const result = data?.message;
  const rows = useMemo(() => filterItems(result?.items ?? [], filters), [result, filters]);
  const customerLabel = result?.filters.customers.find((option) => option.value === customer)?.label ?? customer;

  const pickPreset = (value: Exclude<PeriodPreset, "custom">) => {
    const next = presetRange(value);
    setPreset(value);
    setRange(next);
    setDraftRange(next);
  };
  const pickRange = (next: { from: string; to: string }) => {
    setDraftRange(next);
    if (next.from && next.to) {
      setPreset("custom");
      setRange(next);
    }
  };
  const showArticles = (next: Partial<ItemFilters>) => {
    setFilters({ ...EMPTY_FILTERS, ...next });
    setExpanded(null);
    setTab("articles");
  };
  const openItem = (row: ItemAnalyticsRow) => {
    setFilters({ ...EMPTY_FILTERS, search: row.item_code });
    setExpanded(row.item_code);
    setTab("articles");
  };
  const exportCsv = () => downloadCsv(`analyse-articles-${range.from}-${range.to}.csv`, itemsCsv(rows));

  return (
    <>
      <PageHeader
        eyebrow="Pilotage"
        title="Aide à la décision"
        description="Ce qui rapporte, ce qui tourne, ce qui immobilise votre trésorerie, et quoi faire pour augmenter la marge."
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={!rows.length}>
              <Download /> Exporter
            </Button>
            <Button variant="outline" onClick={() => void mutate()} disabled={isValidating}>
              {isValidating ? <LoaderCircle className="animate-spin" /> : <RefreshCw />}
              Actualiser
            </Button>
          </>
        }
      />

      <Toolbar>
        <div className="flex items-center gap-0.5 rounded-md border bg-background p-0.5" role="group" aria-label="Période rapide">
          {PERIOD_PRESETS.map((option) => (
            <Button
              key={option.value}
              size="sm"
              variant={preset === option.value ? "default" : "ghost"}
              aria-pressed={preset === option.value}
              onClick={() => pickPreset(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <DateRangeFilter from={draftRange.from} to={draftRange.to} onChange={pickRange} />
        <FilterSelect label="Groupe" value={itemGroup} onChange={setItemGroup} options={namesToOptions(result?.filters.item_groups, "Tous les groupes")} />
        <FilterSelect label="Marque" value={brand} onChange={setBrand} options={namesToOptions(result?.filters.brands, "Toutes les marques")} />
        <FilterSelect
          label="Client"
          value={customer}
          onChange={setCustomer}
          options={[{ value: "", label: "Tous les clients" }, ...(result?.filters.customers ?? [])]}
        />
      </Toolbar>

      {customer && (
        <p className="flex flex-wrap items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          Analyse limitée aux ventes à <strong>{customerLabel}</strong> : les alertes de stock (dormant, surstock, rupture, péremption) sont masquées.
          <Button variant="ghost" size="sm" onClick={() => setCustomer("")}>
            <X /> Tous les clients
          </Button>
        </p>
      )}

      {error ? (
        <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          {apiErrorMessage(error)}
        </p>
      ) : null}

      <Kpis data={result} onShowAlerts={() => showArticles({ alert: "any" })} />
      {result && <Opportunities data={result} onPick={(alert) => showArticles({ alert })} />}

      <Tabs value={tab} onValueChange={(value) => setTab(String(value || "decisions") as Tab)} aria-label="Vues de l'analyse">
        <TabsList variant="line">
          <TabsTrigger value="decisions">Décisions</TabsTrigger>
          <TabsTrigger value="articles">Articles</TabsTrigger>
          <TabsTrigger value="clients">Clients</TabsTrigger>
        </TabsList>

        <TabsContent value="decisions" className="pt-2">
          {result ? (
            <DecisionPanel data={result} onPickQuadrant={(quadrant) => showArticles({ quadrant })} onOpenItem={openItem} />
          ) : isLoading ? (
            <div className="grid min-h-60 place-items-center">
              <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : null}
        </TabsContent>

        <TabsContent value="articles" className="flex flex-col gap-3 pt-2">
          <Toolbar>
            <InputGroup className="min-w-48 flex-1 bg-background">
              <InputGroupAddon>
                <Search />
              </InputGroupAddon>
              <InputGroupInput
                value={filters.search}
                onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
                placeholder="Désignation, code ou marque…"
                aria-label="Rechercher un article"
              />
            </InputGroup>
            <FilterSelect
              label="Quadrant"
              value={filters.quadrant}
              onChange={(value) => setFilters((current) => ({ ...current, quadrant: value as Quadrant | "" }))}
              options={QUADRANT_OPTIONS}
            />
            <FilterSelect
              label="Classe"
              value={filters.abc}
              onChange={(value) => setFilters((current) => ({ ...current, abc: value as AbcClass | "" }))}
              options={ABC_OPTIONS}
            />
            <FilterSelect
              label="Alerte"
              value={filters.alert}
              onChange={(value) => setFilters((current) => ({ ...current, alert: value as AlertFilter }))}
              options={ALERT_OPTIONS}
            />
            {(filters.search || filters.quadrant || filters.abc || filters.alert) && (
              <Button variant="ghost" size="sm" onClick={() => setFilters(EMPTY_FILTERS)}>
                <X /> Effacer
              </Button>
            )}
            <span className="ml-auto t-meta text-muted-foreground">
              {rows.length} article{rows.length > 1 ? "s" : ""}
            </span>
          </Toolbar>
          {isLoading && !result ? (
            <div className="grid min-h-60 place-items-center">
              <LoaderCircle className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <ItemAnalyticsTable
              rows={rows}
              expanded={expanded}
              onToggle={(code) => setExpanded((current) => (current === code ? null : code))}
              fromDate={range.from}
              toDate={range.to}
              empty={<EmptyState icon={Boxes} title="Aucun article ne correspond" description="Modifiez la période ou les filtres." />}
            />
          )}
        </TabsContent>

        <TabsContent value="clients" className="pt-2">
          {tab === "clients" && (
            <CustomerAnalyticsTable
              query={{ fromDate: range.from, toDate: range.to, itemGroup, brand }}
              onShowItems={(value) => {
                setCustomer(value);
                showArticles({});
              }}
            />
          )}
        </TabsContent>
      </Tabs>
    </>
  );
}

function Kpis({ data, onShowAlerts }: { data?: ItemAnalyticsData; onShowAlerts: () => void }) {
  const totals = data?.totals;
  const previous = data ? `vs ${formatShortDate(data.previous_period.from_date)} – ${formatShortDate(data.previous_period.to_date)}` : undefined;
  const delta = (value: number | null | undefined) => {
    const text = formatDelta(value);
    return text ? <StatusBadge tone={deltaTone(value)} size="sm" dot={false}>{text}</StatusBadge> : null;
  };
  return (
    <section aria-label="Indicateurs de rentabilité" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
      <KpiTile
        icon={Banknote}
        label="CA HT"
        value={totals ? formatMoney(totals.revenue) : "—"}
        hint={totals ? <span className="flex flex-wrap items-center gap-1.5">{delta(totals.revenue_delta)}{previous}</span> : undefined}
      />
      <KpiTile
        icon={HandCoins}
        tone={totals && totals.margin < 0 ? "danger" : "neutral"}
        label="Marge brute"
        value={totals ? formatMoney(totals.margin) : "—"}
        hint={totals ? <span className="flex flex-wrap items-center gap-1.5">{delta(totals.margin_delta)}Taux de marque {formatPercent(totals.margin_rate)}</span> : undefined}
      />
      <KpiTile
        icon={Boxes}
        label="Valeur du stock"
        value={totals ? formatMoney(totals.stock_value) : "—"}
        hint={totals ? `${totals.items_in_stock} articles en stock` : undefined}
      />
      <KpiTile
        icon={Gauge}
        label="Rotation annuelle"
        value={totals ? `${formatRatio(totals.rotation)}×` : "—"}
        hint="Coût des ventes annualisé / stock"
      />
      <KpiTile
        icon={TrendingUp}
        tone={totals?.gmroi != null && totals.gmroi < 1 ? "warning" : "neutral"}
        label="GMROI"
        value={totals ? formatRatio(totals.gmroi) : "—"}
        hint="DA de marge par an pour 1 DA de stock"
      />
      <KpiTile
        icon={TriangleAlert}
        tone={totals?.items_with_alerts ? "warning" : "neutral"}
        label="Articles à traiter"
        value={totals ? totals.items_with_alerts : "—"}
        hint={totals ? `sur ${totals.items_sold} vendus` : undefined}
        onClick={onShowAlerts}
      />
    </section>
  );
}

function Opportunities({ data, onPick }: { data: ItemAnalyticsData; onPick: (alert: AlertFilter) => void }) {
  const entries = OPPORTUNITIES.filter((entry) => data.opportunities[entry.code]?.count > 0);
  if (!entries.length) return null;
  return (
    <section aria-label="Gisements de profit" className="rounded-xl border bg-card p-3">
      <h2 className="t-micro text-muted-foreground">Gisements de profit</h2>
      <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {entries.map((entry) => {
          const value = data.opportunities[entry.code];
          return (
            <button
              key={entry.code}
              type="button"
              onClick={() => onPick(entry.code)}
              className={cn("rounded-lg border border-hairline px-3 py-2 text-left transition-colors hover:border-brand-300 hover:bg-brand-50/50")}
            >
              <p className="flex items-center justify-between gap-2 text-sm font-medium">
                {entry.label}
                <span className="t-meta text-muted-foreground">
                  {value.count} article{value.count > 1 ? "s" : ""}
                </span>
              </p>
              <p className="num text-lg font-semibold">{formatMoney(value.amount)}</p>
              <p className="t-meta text-muted-foreground">{entry.hint}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
