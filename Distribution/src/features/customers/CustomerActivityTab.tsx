import { Link } from "react-router-dom";
import { AlertTriangle, CalendarClock, HandCoins, LoaderCircle, ReceiptText, ShoppingCart, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { KpiTile } from "@/components/ui/kpi-tile";
import { StatusBadge } from "@/components/ui/status-badge";
import { useCustomerActivity, type CustomerActivity } from "@/shared/api/customers";
import { apiErrorMessage } from "@/shared/api/distribution";
import { formatMoney, formatShortDate } from "@/shared/format";

type OrderRow = CustomerActivity["orders"][number];
type DeliveryRow = CustomerActivity["deliveries"][number];
type InvoiceRow = CustomerActivity["invoices"][number];
type PaymentRow = CustomerActivity["payments"][number];

const today = () => new Date().toISOString().slice(0, 10);

function Section<T>({ title, label, columns, rows, rowKey }: {
  title: string;
  label: string;
  columns: Array<DataTableColumn<T>>;
  rows: T[];
  rowKey: (row: T) => string;
}) {
  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <DataTable
          label={label}
          columns={columns}
          rows={rows}
          rowKey={rowKey}
          className="rounded-none border-0"
          maxHeight="max-h-80"
          empty={<p className="py-6 text-center text-sm text-muted-foreground">Aucun document.</p>}
        />
      </CardContent>
    </Card>
  );
}

const orderColumns: Array<DataTableColumn<OrderRow>> = [
  {
    id: "name",
    header: "Commande",
    cell: (row) => (
      <Link to={`/commandes/${encodeURIComponent(row.name)}`} className="font-medium text-brand-700 hover:underline">
        {row.name}
      </Link>
    ),
  },
  { id: "date", header: "Date", width: "100px", cell: (row) => formatShortDate(row.date) },
  { id: "status", header: "Statut", width: "150px", hideBelow: "md", cell: (row) => <span className="text-muted-foreground">{row.status}</span> },
  { id: "total", header: "Montant", width: "130px", align: "right", numeric: true, cell: (row) => formatMoney(row.grand_total) },
];

const deliveryColumns: Array<DataTableColumn<DeliveryRow>> = [
  {
    id: "name",
    header: "Bon de livraison",
    cell: (row) => (
      <span className="font-medium">
        {row.name} {row.is_return ? <StatusBadge tone="warning" size="sm">Retour</StatusBadge> : null}
      </span>
    ),
  },
  { id: "date", header: "Date", width: "100px", cell: (row) => formatShortDate(row.date) },
  { id: "status", header: "Statut", width: "130px", hideBelow: "md", cell: (row) => <span className="text-muted-foreground">{row.status}</span> },
  { id: "total", header: "Montant", width: "130px", align: "right", numeric: true, cell: (row) => formatMoney(row.grand_total) },
];

const invoiceColumns: Array<DataTableColumn<InvoiceRow>> = [
  { id: "name", header: "Facture", cell: (row) => <span className="font-medium">{row.name}</span> },
  { id: "date", header: "Date", width: "100px", hideBelow: "md", cell: (row) => formatShortDate(row.date) },
  {
    id: "due",
    header: "Échéance",
    width: "110px",
    cell: (row) =>
      row.due_date ? (
        <span className={row.outstanding_amount > 0 && row.due_date < today() ? "font-medium text-red-700" : undefined}>
          {formatShortDate(row.due_date)}
        </span>
      ) : (
        "—"
      ),
  },
  { id: "total", header: "Montant", width: "120px", align: "right", numeric: true, hideBelow: "sm", cell: (row) => formatMoney(row.grand_total) },
  {
    id: "outstanding",
    header: "Reste dû",
    width: "120px",
    align: "right",
    numeric: true,
    cell: (row) => (row.outstanding_amount ? <span className="font-medium">{formatMoney(row.outstanding_amount)}</span> : <span className="text-muted-foreground">—</span>),
  },
];

const paymentColumns: Array<DataTableColumn<PaymentRow>> = [
  {
    id: "name",
    header: "Encaissement",
    cell: (row) => (
      <div className="min-w-0">
        <p className="truncate font-medium">{row.name}</p>
        <p className="truncate t-meta text-subtle">
          {row.mode}
          {row.cheque_number ? ` n° ${row.cheque_number}` : ""}
          {row.delivery_note ? ` · ${row.delivery_note}` : ""}
        </p>
      </div>
    ),
  },
  { id: "date", header: "Date", width: "100px", cell: (row) => (row.date ? formatShortDate(row.date) : "—") },
  { id: "status", header: "Contrôle", width: "110px", hideBelow: "md", cell: (row) => <span className="text-muted-foreground">{row.status}</span> },
  { id: "amount", header: "Montant", width: "120px", align: "right", numeric: true, cell: (row) => formatMoney(row.amount) },
];

export function CustomerActivityTab({ customer }: { customer: string }) {
  const { data, error, isLoading } = useCustomerActivity(customer, true);
  const activity = data?.message;

  if (error) {
    return (
      <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <AlertTriangle className="size-4 shrink-0" />
        {apiErrorMessage(error)}
      </p>
    );
  }
  if (isLoading || !activity) {
    return (
      <div className="grid min-h-40 place-items-center">
        <LoaderCircle className="size-6 animate-spin text-brand-600" />
      </div>
    );
  }

  const balance = activity.balance.reduce((sum, row) => sum + row.amount, 0);

  return (
    <div className="grid gap-4">
      <section aria-label="Indicateurs financiers" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile icon={Wallet} tone={balance > 0 ? "warning" : "neutral"} label="Solde comptable" value={formatMoney(balance)} />
        <KpiTile
          icon={ReceiptText}
          tone={activity.outstanding.overdue > 0 ? "danger" : "neutral"}
          label="Factures impayées"
          value={formatMoney(activity.outstanding.total)}
          hint={activity.outstanding.overdue > 0 ? `dont ${formatMoney(activity.outstanding.overdue)} échu` : `${activity.outstanding.count} facture(s)`}
        />
        <KpiTile icon={ShoppingCart} tone="neutral" label="CA 12 mois" value={formatMoney(activity.last_12_months.revenue)} hint={`${activity.last_12_months.orders} commande(s)`} />
        <KpiTile
          icon={CalendarClock}
          tone="neutral"
          label="Dernière commande"
          value={activity.last_12_months.last_order ? formatShortDate(activity.last_12_months.last_order) : "—"}
        />
      </section>
      <div className="grid gap-4 xl:grid-cols-2">
        <Section title="Commandes récentes" label="Commandes du client" columns={orderColumns} rows={activity.orders} rowKey={(row) => row.name} />
        <Section title="Factures" label="Factures du client" columns={invoiceColumns} rows={activity.invoices} rowKey={(row) => row.name} />
        <Section title="Livraisons" label="Livraisons du client" columns={deliveryColumns} rows={activity.deliveries} rowKey={(row) => row.name} />
        <Section title="Encaissements" label="Encaissements du client" columns={paymentColumns} rows={activity.payments} rowKey={(row) => row.name} />
      </div>
      <p className="flex items-center gap-1.5 t-meta text-muted-foreground">
        <HandCoins className="size-3.5" /> 20 derniers documents par type.
      </p>
    </div>
  );
}
