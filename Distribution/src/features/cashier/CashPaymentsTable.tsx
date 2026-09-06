import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { Money } from "@/components/ui/money";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  advanceOf,
  allocatedOf,
  allocateToOldest,
  countedAmountOf,
  dueDateOverdue,
  GAP_EPS,
  isOverAllocated,
  paymentRowState,
  plural,
  type PaymentEdit,
} from "@/features/cashier/cashTotals";
import { formatMoney } from "@/shared/format";
import type { CashCollection, CashReconciliation } from "@/shared/types/distribution";
import { cn } from "@/lib/utils";

const ROW_TONE = {
  Comptabilisé: "success",
  "À vérifier": "danger",
  Avance: "warning",
  Prêt: "neutral",
} as const;

function MethodBadge({ method }: { method: string }) {
  const cheque = method === "Chèque";
  return (
    <span
      className={cn(
        "grid size-5 place-items-center rounded-[6px] text-[9px] font-semibold",
        cheque ? "bg-indigo-50 text-indigo-700" : "bg-emerald-50 text-emerald-700",
      )}
    >
      {cheque ? "CH" : "ES"}
    </span>
  );
}

export function CashPaymentsTable({
  reconciliation,
  edits,
  expanded,
  readOnly,
  onToggle,
  onEdit,
}: {
  reconciliation: CashReconciliation;
  edits: Record<string, PaymentEdit>;
  expanded: string | null;
  readOnly: boolean;
  onToggle: (paymentId: string) => void;
  onEdit: (paymentId: string, patch: Partial<PaymentEdit>) => void;
}) {
  const payments = reconciliation.payments;
  const locked = readOnly || reconciliation.status === "Validée";

  const columns: Array<DataTableColumn<CashCollection>> = [
    {
      id: "method",
      header: "",
      width: "24px",
      cell: (payment) => <MethodBadge method={payment.method} />,
    },
    {
      id: "client",
      header: "Client · BL",
      width: "180px",
      cell: (payment) => (
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-medium">{payment.customerName || payment.customer}</p>
          <p className="num truncate text-[11px] text-muted-foreground">{payment.deliveryNote}</p>
        </div>
      ),
    },
    {
      id: "invoice",
      header: "Facture",
      width: "120px",
      cell: (payment) =>
        payment.salesInvoice ? (
          <span className="num text-[11.5px]">{payment.salesInvoice}</span>
        ) : (
          <span className="text-[11.5px] text-red-700">Facture non créée</span>
        ),
    },
    {
      id: "declared",
      header: "Déclaré",
      width: "112px",
      align: "right",
      numeric: true,
      cell: (payment) => <Money value={payment.amount} precise />,
    },
    {
      id: "counted",
      header: "Compté",
      width: "120px",
      align: "right",
      cell: (payment) => {
        const edit = edits[payment.name];
        const counted = countedAmountOf(payment, edit);
        const cheque = payment.method === "Chèque";
        if (!cheque || locked) {
          return <span className="num text-muted-foreground">{formatMoney(counted, { precise: true })}</span>;
        }
        const mismatch = Math.abs(counted - payment.amount) > GAP_EPS;
        return (
          <Input
            type="number"
            min="0"
            step="0.01"
            value={edit?.countedAmount ?? ""}
            aria-label={`Montant compté ${payment.customerName || payment.customer}`}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => onEdit(payment.name, { countedAmount: event.target.value })}
            className={cn("num ml-auto h-8 w-[108px] text-right", mismatch && "border-red-300")}
          />
        );
      },
    },
    {
      id: "allocated",
      header: "Affecté",
      width: "116px",
      align: "right",
      cell: (payment) => {
        const edit = edits[payment.name];
        const counted = countedAmountOf(payment, edit);
        const allocated = allocatedOf(edit);
        const advance = advanceOf(counted, allocated);
        const over = isOverAllocated(counted, allocated);
        return (
          <div>
            <Money value={allocated} precise />
            {over ? (
              <p className="text-[11px] text-red-700">affecté {formatMoney(allocated, { precise: true })}</p>
            ) : advance > GAP_EPS ? (
              <p className="text-[11px] text-amber-700">avance {formatMoney(advance, { precise: true })}</p>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "state",
      header: "État",
      width: "100px",
      cell: (payment) => {
        const state = paymentRowState(payment, edits[payment.name], reconciliation.status);
        return (
          <StatusBadge tone={ROW_TONE[state]} size="sm">
            {state}
          </StatusBadge>
        );
      },
    },
    {
      id: "expand",
      header: "",
      width: "26px",
      align: "right",
      cell: (payment) => (
        <span className="text-[13px] text-slate-600">{expanded === payment.name ? "▾" : "▸"}</span>
      ),
    },
  ];

  return (
    <Card className="overflow-hidden py-0">
      <CardHeader className="flex-row flex-wrap items-center gap-2 py-2.5">
        <CardTitle>Encaissements par livraison</CardTitle>
        <span className="num rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{payments.length}</span>
        <p className="ml-auto t-body text-muted-foreground">Cliquez une ligne pour ventiler ses factures.</p>
      </CardHeader>
      <CardContent className="px-0 pb-0">
        {!payments.length ? (
          <p className="m-4 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            Aucun encaissement déclaré sur cette tournée. Le contrôle de caisse n'est pas requis ; le retour stock est
            confirmé séparément par le préparateur.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[800px]">
              <DataTable
                className="rounded-none border-0 border-t"
                label="Encaissements par livraison"
                columns={columns}
                rows={payments}
                rowKey={(payment) => payment.name}
                onRowClick={(payment) => onToggle(payment.name)}
                isRowExpanded={(payment) => payment.name === expanded}
                expandedContent={(payment) => (
                  <PaymentExpanded
                    payment={payment}
                    edit={edits[payment.name]}
                    locked={locked}
                    onEdit={onEdit}
                  />
                )}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PaymentExpanded({
  payment,
  edit,
  locked,
  onEdit,
}: {
  payment: CashCollection;
  edit?: PaymentEdit;
  locked: boolean;
  onEdit: (paymentId: string, patch: Partial<PaymentEdit>) => void;
}) {
  const counted = countedAmountOf(payment, edit);
  const allocated = allocatedOf(edit);
  const advance = advanceOf(counted, allocated);
  const invoices = edit?.allocations || [];
  const missingNumber = payment.method === "Chèque" && !String(edit?.chequeNumber || "").trim();

  return (
    <div className="space-y-3 bg-surface-subtle px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="num text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
            Ventilation des factures
          </p>
          <p className="text-xs text-muted-foreground">
            {invoices.length
              ? `${plural(invoices.length, "facture ouverte", "factures ouvertes")} pour ${payment.customerName || payment.customer}`
              : "Aucune facture ouverte — le montant restera en avance client."}
          </p>
        </div>
        {!locked && invoices.length ? (
          <button
            type="button"
            className="text-xs font-semibold text-foreground"
            onClick={() => onEdit(payment.name, { allocations: allocateToOldest(counted, invoices) })}
          >
            Affecter au plus ancien
          </button>
        ) : null}
      </div>

      {payment.method === "Chèque" ? (
        <div className="grid gap-3 rounded-lg border border-hairline bg-background p-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="t-micro text-muted-foreground">Numéro du chèque</span>
            <Input
              value={edit?.chequeNumber ?? ""}
              disabled={locked}
              aria-invalid={missingNumber}
              onChange={(event) => onEdit(payment.name, { chequeNumber: event.target.value })}
              className={cn(missingNumber && "border-red-300")}
            />
          </label>
          <div>
            <p className="t-micro text-muted-foreground">Échéance</p>
            <p className="num mt-1.5 text-sm">{payment.chequeDate || "—"}</p>
          </div>
          {payment.chequePhoto ? (
            <a href={payment.chequePhoto} target="_blank" rel="noreferrer" className="self-end text-sm font-semibold">
              Voir la photo du chèque
            </a>
          ) : null}
        </div>
      ) : null}

      {invoices.length ? (
        <div className="overflow-hidden rounded-lg border border-hairline bg-background">
          <div className="grid grid-cols-[minmax(0,1fr)_116px_128px_132px] border-b bg-muted px-3 py-2 text-[11px] font-medium text-muted-foreground">
            <span>Facture</span>
            <span>Échéance</span>
            <span className="text-right">Solde avant</span>
            <span className="text-right">Affecté</span>
          </div>
          {invoices.map((allocation, index) => {
            const overdue = dueDateOverdue(allocation.dueDate);
            const over = allocation.allocatedAmount - allocation.outstandingBefore > GAP_EPS;
            return (
              <div
                key={`${allocation.salesInvoice}-${index}`}
                className="grid grid-cols-[minmax(0,1fr)_116px_128px_132px] items-center border-b px-3 py-2 last:border-0"
              >
                <span className="num truncate text-[12.5px]">{allocation.salesInvoice}</span>
                <span className={cn("num text-xs", overdue && "text-red-700")}>{allocation.dueDate || "—"}</span>
                <span className="num text-right text-xs">
                  {formatMoney(allocation.outstandingBefore, { precise: true })}
                </span>
                <div className="flex justify-end">
                  <Input
                    type="number"
                    min="0"
                    max={allocation.outstandingBefore}
                    step="0.01"
                    disabled={locked}
                    aria-label={`Montant affecté à ${allocation.salesInvoice}`}
                    value={allocation.allocatedAmount}
                    onChange={(event) => {
                      const allocations = invoices.map((row, rowIndex) =>
                        rowIndex === index ? { ...row, allocatedAmount: Number(event.target.value || 0) } : row,
                      );
                      onEdit(payment.name, { allocations });
                    }}
                    className={cn("num h-8 w-[116px] text-right", over && "border-red-300")}
                  />
                </div>
              </div>
            );
          })}
          <div className="flex items-center justify-between bg-muted px-3 py-2 text-xs">
            <span className={advance > GAP_EPS ? "text-amber-800" : "text-muted-foreground"}>
              {advance > GAP_EPS ? `Avance client : ${formatMoney(advance, { precise: true })}` : "Totalement affecté"}
            </span>
            <span className="num font-medium">{formatMoney(allocated, { precise: true })}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
