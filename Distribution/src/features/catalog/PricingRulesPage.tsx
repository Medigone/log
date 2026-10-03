import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, BadgePercent, CalendarClock, CircleOff, Pencil, Plus, Power, Search, TimerOff } from "lucide-react";
import { FilterSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { KpiTile } from "@/components/ui/kpi-tile";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableRowActions } from "@/components/ui/table-row-actions";
import { Toolbar } from "@/components/ui/toolbar";
import { ruleSummary, useDebouncedValue } from "@/features/catalog/catalogShared";
import { PricingRuleDialog, type RulePreset } from "@/features/catalog/PricingRuleDialog";
import {
  RULE_APPLY_ON_LABELS,
  RULE_STATE_LABELS,
  useCatalogMutations,
  useCatalogOptions,
  usePricingRules,
  type PricingRule,
  type PricingRuleApplyOn,
  type PricingRuleState,
} from "@/shared/api/catalog";
import { apiErrorMessage } from "@/shared/api/distribution";
import type { StatusTone } from "@/shared/design/statusTone";
import { formatShortDate } from "@/shared/format";

const STATE_TONES: Record<PricingRuleState, StatusTone> = {
  active: "success",
  a_venir: "info",
  expiree: "neutral",
  desactivee: "warning",
};

const STATE_OPTIONS = [
  { value: "", label: "Toutes" },
  ...(Object.keys(RULE_STATE_LABELS) as PricingRuleState[]).map((value) => ({ value, label: RULE_STATE_LABELS[value] })),
];

function period(rule: PricingRule) {
  if (!rule.valid_upto) return rule.valid_from ? `Dès le ${formatShortDate(rule.valid_from)}` : "Permanente";
  return `${formatShortDate(rule.valid_from || undefined)} → ${formatShortDate(rule.valid_upto)}`;
}

export function PricingRulesPage() {
  const [searchParams] = useSearchParams();
  const article = searchParams.get("article");
  const [state, setState] = useState<PricingRuleState | "">("");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<PricingRule | null | undefined>(undefined);
  const [preset, setPreset] = useState<RulePreset | null>(null);
  const debounced = useDebouncedValue(search.trim());
  const { data, error, isLoading, mutate } = usePricingRules(state, debounced);
  const { data: optionsData } = useCatalogOptions();
  const api = useCatalogMutations();
  const rules = data?.message?.rules ?? [];
  const counts = data?.message?.counts;

  const openNew = (withPreset: RulePreset | null) => {
    setPreset(withPreset);
    setEditing(null);
  };

  const toggle = async (rule: PricingRule) => {
    try {
      await api.setPricingRuleDisabled(rule.name, !rule.disabled);
      toast.success(rule.disabled ? "Promotion réactivée" : "Promotion désactivée");
      await mutate();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const columns: Array<DataTableColumn<PricingRule>> = [
    {
      id: "title",
      header: "Promotion",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.title}</p>
          <p className="truncate t-meta text-subtle">
            {RULE_APPLY_ON_LABELS[row.apply_on as PricingRuleApplyOn] || row.apply_on} : {row.targets.join(", ") || "—"}
          </p>
        </div>
      ),
    },
    {
      id: "value",
      header: "Remise",
      width: "120px",
      align: "right",
      numeric: true,
      cell: (row) => (
        <span className="font-semibold">
          {ruleSummary(row)}
          {row.min_qty > 1 ? <span className="block t-meta font-normal text-muted-foreground">dès {row.min_qty}</span> : null}
        </span>
      ),
    },
    {
      id: "customers",
      header: "Clients",
      width: "180px",
      hideBelow: "lg",
      cell: (row) => <span className="truncate text-muted-foreground">{row.party || "Tous"}{row.for_price_list ? ` · ${row.for_price_list}` : ""}</span>,
    },
    { id: "period", header: "Période", width: "190px", hideBelow: "md", cell: (row) => <span className="text-muted-foreground">{period(row)}</span> },
    {
      id: "state",
      header: "État",
      width: "120px",
      cell: (row) => <StatusBadge tone={STATE_TONES[row.state]}>{RULE_STATE_LABELS[row.state]}</StatusBadge>,
    },
    {
      id: "actions",
      header: "",
      width: "56px",
      align: "right",
      cell: (row) => (
        <TableRowActions label={`Actions pour ${row.title}`}>
          <DropdownMenuItem disabled={!row.editable} onClick={() => setEditing(row)}>
            <Pencil /> Modifier
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void toggle(row)}>
            <Power /> {row.disabled ? "Réactiver" : "Désactiver"}
          </DropdownMenuItem>
        </TableRowActions>
      ),
    },
  ];

  const kpi = (value: PricingRuleState) => ({
    onClick: () => setState(state === value ? "" : value),
    className: state === value ? "border-brand-300 bg-brand-50/50" : undefined,
    value: counts ? counts[value] ?? 0 : "—",
  });

  return (
    <>
      <PageHeader
        eyebrow="Catalogue"
        title="Promotions"
        description="Remises et prix promotionnels par article, groupe ou marque, pour tous les clients ou une cible."
        actions={
          <div className="flex flex-wrap gap-2">
            {article ? (
              <Button variant="outline" onClick={() => openNew({ apply_on: "Item Code", targets: [{ value: article, label: article }] })}>
                <Plus /> Promotion sur {article}
              </Button>
            ) : null}
            <Button onClick={() => openNew(null)}>
              <Plus /> Nouvelle promotion
            </Button>
          </div>
        }
      />

      <section aria-label="Indicateurs des promotions" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={BadgePercent} tone="success" label="Actives" {...kpi("active")} />
        <KpiTile icon={CalendarClock} tone="info" label="À venir" {...kpi("a_venir")} />
        <KpiTile icon={TimerOff} tone="neutral" label="Expirées" {...kpi("expiree")} />
        <KpiTile icon={CircleOff} tone="warning" label="Désactivées" {...kpi("desactivee")} />
      </section>

      <Toolbar>
        <InputGroup className="min-w-48 flex-1 bg-background">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Titre de la promotion…" aria-label="Rechercher une promotion" />
        </InputGroup>
        <FilterSelect label="État" value={state} onChange={(value) => setState(value as PricingRuleState | "")} options={STATE_OPTIONS} />
      </Toolbar>

      {error ? (
        <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          {apiErrorMessage(error)}
        </p>
      ) : null}

      <DataTable
        label="Promotions"
        columns={columns}
        rows={rules}
        rowKey={(row) => row.name}
        rowTone={(row) => STATE_TONES[row.state]}
        onRowClick={(row) => row.editable && setEditing(row)}
        isLoading={isLoading && !rules.length}
        empty={
          <EmptyState
            icon={BadgePercent}
            title="Aucune promotion"
            description="Créez une remise sur un article, un groupe ou une marque."
            action={
              <Button onClick={() => openNew(null)}>
                <Plus /> Nouvelle promotion
              </Button>
            }
          />
        }
      />
      <p className="t-meta text-muted-foreground">
        Les règles créées dans le Desk avec des conditions avancées (produit offert, coupons…) s’affichent ici mais se modifient dans le Desk.
      </p>

      <PricingRuleDialog
        open={editing !== undefined}
        onOpenChange={(open) => !open && setEditing(undefined)}
        rule={editing ?? null}
        preset={preset}
        options={optionsData?.message}
        searchCustomers={api.searchCustomers}
        onSubmit={async (payload) => {
          await api.savePricingRule(payload);
          setEditing(undefined);
          toast.success(payload.name ? "Promotion enregistrée" : "Promotion créée");
          await mutate();
        }}
      />
    </>
  );
}
