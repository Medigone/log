import { useState } from "react";
import { toast } from "sonner";
import { Pencil, Save, Target, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Spinner } from "@/components/ui/spinner";
import { StatusBadge } from "@/components/ui/status-badge";
import { Textarea } from "@/components/ui/textarea";
import { formatPercent } from "@/features/analytics/analyticsShared";
import { ErrorNote, Panel, RefreshButton } from "@/features/pilotage/PilotageParts";
import { cn } from "@/lib/utils";
import { apiErrorMessage } from "@/shared/api/distribution";
import { useObjectives, useSaveObjectives, type ObjectiveKey, type ObjectiveProgress, type Objectives } from "@/shared/api/pilotage";
import { formatMoney } from "@/shared/format";
import { parseDecimal } from "@/shared/format/parseDecimal";

const KEYS: Array<{ key: ObjectiveKey; label: string; hint: string }> = [
  { key: "ca_ht", label: "Chiffre d’affaires HT", hint: "livré sur le mois" },
  { key: "marge", label: "Marge brute", hint: "CA livré moins coût des ventes" },
  { key: "encaissements", label: "Encaissements", hint: "règlements clients reçus" },
];

function currentMonth() {
  return new Date().toLocaleDateString("en-CA").slice(0, 7);
}

function monthLabel(iso: string) {
  return new Date(`${iso.slice(0, 7)}-01T00:00:00`).toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function progressTone(progress: ObjectiveProgress): "success" | "warning" | "danger" | "neutral" {
  if (progress.projected_progress == null) return "neutral";
  if (progress.projected_progress >= 1) return "success";
  return progress.projected_progress >= 0.9 ? "warning" : "danger";
}

const BAR = { success: "bg-emerald-500", warning: "bg-amber-500", danger: "bg-red-500", neutral: "bg-brand-600" } as const;

function ObjectiveCard({ label, hint, progress }: { label: string; hint: string; progress: ObjectiveProgress }) {
  const tone = progressTone(progress);
  return (
    <section aria-label={label} className="flex flex-col gap-3 rounded-lg border border-hairline bg-card p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="t-micro text-muted-foreground">{label}</p>
          <p className="t-meta text-muted-foreground">{hint}</p>
        </div>
        {progress.target ? (
          <StatusBadge tone={tone} size="sm" dot={false}>
            {formatPercent(progress.progress)}
          </StatusBadge>
        ) : null}
      </div>
      <p className="num text-2xl font-semibold tracking-tight">
        {formatMoney(progress.actual)}
        {progress.target ? <span className="text-base font-normal text-muted-foreground"> / {formatMoney(progress.target)}</span> : null}
      </p>
      {progress.target ? (
        <>
          <div className="relative h-2 overflow-visible rounded-full bg-muted" aria-hidden>
            <div className={cn("h-full rounded-full", BAR[tone])} style={{ width: `${Math.min(progress.progress ?? 0, 1) * 100}%` }} />
            <span
              className="absolute -top-1 h-4 w-0.5 rounded bg-foreground/60"
              style={{ left: `${progress.expected_progress * 100}%` }}
              title="Avancement attendu à date"
            />
          </div>
          <p className="t-meta text-muted-foreground">
            Fin de mois projetée : <span className="num font-medium text-foreground">{formatMoney(progress.projection ?? 0)}</span> (
            {formatPercent(progress.projected_progress)} de l’objectif) · attendu à date {formatPercent(progress.expected_progress)}
          </p>
        </>
      ) : (
        <p className="t-meta text-muted-foreground">Aucun objectif fixé pour ce mois.</p>
      )}
    </section>
  );
}

function TargetsForm({ data, onSaved, onCancel }: { data: Objectives; onSaved: (next: Objectives) => void; onCancel: () => void }) {
  const { save, saving } = useSaveObjectives();
  const [values, setValues] = useState<Record<ObjectiveKey, string>>(() => ({
    ca_ht: data.targets.ca_ht ? String(data.targets.ca_ht) : "",
    marge: data.targets.marge ? String(data.targets.marge) : "",
    encaissements: data.targets.encaissements ? String(data.targets.encaissements) : "",
  }));
  const [notes, setNotes] = useState(data.notes);
  const invalid = KEYS.some(({ key }) => values[key].trim() && (parseDecimal(values[key]) == null || (parseDecimal(values[key]) ?? 0) < 0));

  const submit = async () => {
    try {
      const next = await save({
        month: data.month,
        notes,
        ...Object.fromEntries(KEYS.map(({ key }) => [key, values[key].trim() ? parseDecimal(values[key]) : null])),
      });
      toast.success(`Objectifs de ${monthLabel(data.month)} enregistrés`);
      onSaved(next);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  return (
    <Panel title={`Objectifs de ${monthLabel(data.month)}`}>
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          {KEYS.map(({ key, label }) => (
            <Field key={key}>
              <FieldLabel htmlFor={`objective-${key}`}>{label}</FieldLabel>
              <Input
                id={`objective-${key}`}
                inputMode="decimal"
                className="num"
                placeholder="DZD"
                value={values[key]}
                onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
              />
            </Field>
          ))}
        </div>
        <Field>
          <FieldLabel htmlFor="objective-notes">Notes</FieldLabel>
          <Textarea id="objective-notes" rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Contexte du mois, actions prévues…" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>
            <X /> Annuler
          </Button>
          <Button type="submit" disabled={saving || invalid}>
            {saving ? <Spinner /> : <Save />} Enregistrer les objectifs
          </Button>
        </div>
      </form>
    </Panel>
  );
}

type HistoryRow = Objectives["history"][number];

function historyCell(row: HistoryRow, key: ObjectiveKey) {
  const target = row[`${key}_target`];
  const ratio = target ? row[key] / target : null;
  return (
    <div>
      <p>{formatMoney(row[key])}</p>
      {target ? (
        <p className={cn("t-meta", ratio != null && ratio >= 1 ? "text-emerald-700" : "text-muted-foreground")}>
          {formatPercent(ratio)} de {formatMoney(target)}
        </p>
      ) : null}
    </div>
  );
}

const historyColumns: Array<DataTableColumn<HistoryRow>> = [
  { id: "month", header: "Mois", sortValue: (row) => row.month, cell: (row) => <span className="font-medium capitalize">{monthLabel(row.month)}</span> },
  ...KEYS.map(({ key, label }): DataTableColumn<HistoryRow> => ({ id: key, header: label, width: "200px", align: "right", numeric: true, sortValue: (row) => row[key], cell: (row) => historyCell(row, key) })),
];

/** Objectifs mensuels du responsable, avancement et projection de fin de mois. */
export function ObjectivesPage() {
  const [month, setMonth] = useState(currentMonth);
  const [editing, setEditing] = useState(false);
  const { data, error, isValidating, mutate } = useObjectives(`${month}-01`);
  const result = data?.message;

  return (
    <>
      <PageHeader
        eyebrow="Pilotage"
        title="Objectifs"
        description="Objectifs mensuels de chiffre d’affaires, de marge et d’encaissements, avec la projection de fin de mois au rythme actuel."
        actions={
          <>
            <Input type="month" aria-label="Mois" className="w-44" value={month} onChange={(event) => event.target.value && setMonth(event.target.value)} />
            <Button variant="outline" onClick={() => setEditing(true)} disabled={!result || editing}>
              <Pencil /> Fixer les objectifs
            </Button>
            <RefreshButton onClick={() => void mutate()} busy={isValidating} />
          </>
        }
      />
      <ErrorNote error={error} />

      {editing && result ? (
        <TargetsForm
          key={result.month}
          data={result}
          onCancel={() => setEditing(false)}
          onSaved={(next) => {
            setEditing(false);
            void mutate({ message: next }, { revalidate: false });
          }}
        />
      ) : null}

      {result && !result.targets.ca_ht && !result.targets.marge && !result.targets.encaissements && !editing ? (
        <p className="flex flex-wrap items-center gap-2 rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          <Target className="size-4" /> Aucun objectif fixé pour {monthLabel(result.month)}.
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            Fixer les objectifs
          </Button>
        </p>
      ) : null}

      <div className="grid gap-3 lg:grid-cols-3">
        {result
          ? KEYS.map(({ key, label, hint }) => <ObjectiveCard key={key} label={label} hint={hint} progress={result.progress[key]} />)
          : null}
      </div>
      {result?.notes ? <p className="rounded-md border bg-card px-3 py-2 text-[13px] text-muted-foreground">{result.notes}</p> : null}

      <Panel title="Six derniers mois" hint="réalisé et taux d’atteinte">
        <DataTable label="Historique des objectifs" columns={historyColumns} rows={result?.history ?? []} rowKey={(row) => row.month} />
      </Panel>
    </>
  );
}
