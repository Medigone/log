import { CalendarClock, Plus, Trash2, Wand2 } from "lucide-react";
import { CommitInput } from "@/components/CommitInput";
import { parseDecimal } from "@/shared/format/parseDecimal";
import { FormSelect } from "@/components/FilterSelect";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  balanceSchedule,
  newKey,
  scheduleFromPreview,
  scheduleGap,
  type ManualScheduleRow,
  type OrderDraft,
} from "@/features/orders/orderDraft";
import { cn } from "@/lib/utils";
import type { OrderDetail, OrderOptions } from "@/shared/api/orders";
import { formatMoney, formatShortDate } from "@/shared/format";

function addDays(iso: string, days: number) {
  const date = iso ? new Date(`${iso}T00:00:00`) : new Date();
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function PaymentScheduleEditor({
  draft,
  options,
  preview,
  readOnly,
  onChange,
}: {
  draft: OrderDraft;
  options?: OrderOptions;
  preview?: OrderDetail | null;
  readOnly?: boolean;
  onChange: (patch: Partial<OrderDraft>) => void;
}) {
  const total = preview?.totals.rounded_total ?? 0;
  const modes = [{ value: "", label: "Mode" }, ...(options?.modes_of_payment || []).map((mode) => ({ value: mode, label: mode }))];
  const setRows = (schedule: ManualScheduleRow[]) => onChange({ schedule });
  const updateRow = (key: string, patch: Partial<ManualScheduleRow>) =>
    setRows(draft.schedule.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  if (draft.scheduleMode === "template" || readOnly) {
    const rows = preview?.payment_schedule ?? [];
    return (
      <section className="flex flex-col gap-2.5" aria-label="Échéances">
        <div className="flex items-center gap-2">
          <CalendarClock className="size-4 text-muted-foreground" />
          <h3 className="text-[13px] font-semibold">Échéances</h3>
        </div>
        {readOnly ? null : (
          <FormSelect
            aria-label="Conditions de paiement"
            value={draft.paymentTermsTemplate}
            onChange={(value) => onChange({ paymentTermsTemplate: value })}
            options={[
              { value: "", label: "Paiement unique à la commande" },
              ...(options?.payment_terms_templates || []).map((name) => ({ value: name, label: name })),
            ]}
          />
        )}
        <ul className="flex flex-col gap-1 text-[12.5px]">
          {rows.map((row, index) => (
            <li key={`${row.due_date}-${index}`} className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">
                {formatShortDate(row.due_date)}
                {row.invoice_portion ? ` · ${row.invoice_portion} %` : ""}
                {row.mode_of_payment ? ` · ${row.mode_of_payment}` : ""}
              </span>
              <span className="num font-medium">{formatMoney(row.payment_amount, { precise: true })}</span>
            </li>
          ))}
        </ul>
        {readOnly ? null : (
          <Button
            variant="ghost"
            size="sm"
            className="self-start"
            disabled={!rows.length}
            onClick={() => onChange({ scheduleMode: "manual", schedule: scheduleFromPreview(rows) })}
          >
            Personnaliser l’échéancier
          </Button>
        )}
      </section>
    );
  }

  const gap = scheduleGap(draft.schedule, total);
  return (
    <section className="flex flex-col gap-2.5" aria-label="Échéances">
      <div className="flex items-center gap-2">
        <CalendarClock className="size-4 text-muted-foreground" />
        <h3 className="text-[13px] font-semibold">Échéancier personnalisé</h3>
        <Button
          variant="ghost"
          size="sm"
          className="ml-auto"
          onClick={() => onChange({ scheduleMode: "template", schedule: [] })}
        >
          Utiliser un modèle
        </Button>
      </div>
      {draft.schedule.map((row, index) => (
        <div key={row.key} className="grid grid-cols-[minmax(0,1fr)_110px_32px] gap-1.5">
          <Input
            type="date"
            aria-label={`Date échéance ${index + 1}`}
            className="h-8"
            value={row.dueDate}
            onChange={(event) => updateRow(row.key, { dueDate: event.target.value })}
          />
          <CommitInput
            aria-label={`Montant échéance ${index + 1}`}
            inputMode="decimal"
            className="num h-8 text-right"
            value={String(row.amount)}
            onCommit={(value) => {
              const amount = parseDecimal(value);
              if (amount != null && amount >= 0) updateRow(row.key, { amount });
            }}
          />
          <button
            type="button"
            aria-label={`Supprimer échéance ${index + 1}`}
            onClick={() => setRows(draft.schedule.filter((item) => item.key !== row.key))}
            className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </button>
          <div className="col-span-2">
            <FormSelect
              aria-label={`Mode de paiement échéance ${index + 1}`}
              value={row.mode}
              onChange={(mode) => updateRow(row.key, { mode })}
              options={modes}
            />
          </div>
        </div>
      ))}
      <div className="flex flex-wrap gap-1.5">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            const last = draft.schedule[draft.schedule.length - 1];
            setRows([
              ...draft.schedule,
              {
                key: newKey("echeance"),
                dueDate: addDays(last?.dueDate || draft.deliveryDate, 30),
                amount: gap > 0 ? gap : 0,
                mode: "",
              },
            ]);
          }}
        >
          <Plus /> Ajouter une échéance
        </Button>
        {Math.abs(gap) > 0.009 && draft.schedule.length ? (
          <Button variant="outline" size="sm" onClick={() => setRows(balanceSchedule(draft.schedule, total))}>
            <Wand2 /> Répartir sur la dernière
          </Button>
        ) : null}
      </div>
      <p
        className={cn("text-[12.5px] font-medium", Math.abs(gap) > 0.1 ? "text-destructive" : "text-emerald-700")}
        aria-live="polite"
      >
        {Math.abs(gap) > 0.1
          ? gap > 0
            ? `Reste à répartir : ${formatMoney(gap, { precise: true })}`
            : `Trop réparti : ${formatMoney(-gap, { precise: true })}`
          : "L’échéancier couvre le total."}
      </p>
    </section>
  );
}
