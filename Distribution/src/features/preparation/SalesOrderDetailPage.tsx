import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AlertTriangle, ArrowLeft, ClipboardList, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { CreatePickListDialog } from "@/features/preparation/CreatePickListDialog";
import { OrderModifiedAlert } from "@/features/preparation/OrderModifiedAlert";
import { apiErrorMessage } from "@/shared/api/distribution";
import {
  usePreparationMutations,
  useSalesOrderPickDetail,
  orderIsModified,
  type SalesOrderPickLine,
} from "@/shared/api/preparation";
import { salesOrderDeskStatus, orderPickListState, orderPickListStatus } from "@/shared/design/statusTone";
import { formatQuantity, formatShortDate } from "@/shared/format";

function pickListNames(order: { pick_lists?: Array<{ name: string }>; draft_pick_lists?: string[]; draft_pick_list?: string; existing_pick_list?: string }) {
  if (order.pick_lists?.length) return Array.from(new Set(order.pick_lists.map((pickList) => pickList.name).filter(Boolean)));
  if (order.draft_pick_lists?.length) return order.draft_pick_lists;
  if (order.draft_pick_list) return [order.draft_pick_list];
  if (order.existing_pick_list) return [order.existing_pick_list];
  return [];
}

function lineIsShort(line: SalesOrderPickLine) {
  return line.required > (line.available || 0) + 0.000001;
}

function SummaryCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="p-3.5">
        <p className="t-micro text-muted-foreground">{label}</p>
        <p className="mt-2 font-semibold text-foreground">{value}</p>
        {hint ? <p className="mt-0.5 t-meta text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export function SalesOrderDetailPage() {
  const { orderId } = useParams();
  const navigate = useNavigate();
  const name = orderId ? decodeURIComponent(orderId) : "";
  const { data, error, isLoading, mutate } = useSalesOrderPickDetail(name || undefined);
  const { createPickList, creating, acknowledgeModification, acknowledging } = usePreparationMutations();
  const order = data?.message;
  const [confirming, setConfirming] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const modified = orderIsModified(order);

  const goBack = () => navigate("/preparation");
  const shortages = order?.stock_shortages || [];
  const canCreate = order?.can_create_pick_list !== false && !modified;
  const lists = order ? pickListNames(order) : [];
  const desk = salesOrderDeskStatus(order?.status);
  const pick = orderPickListStatus(orderPickListState(order || {}));
  const requested = order?.requested_qty ?? order?.total_qty ?? 0;
  const picked = order?.picked_qty ?? 0;
  const percent = requested > 0 ? Math.min(100, Math.round((picked / requested) * 100)) : 0;

  const itemColumns: Array<DataTableColumn<SalesOrderPickLine>> = [
    {
      id: "item",
      header: "Article",
      sortValue: (row) => row.item_name || row.item_code,
      cell: (row) => (
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium">{row.item_name || row.item_code}</span>
          {row.item_name && row.item_name !== row.item_code ? (
            <span className="text-muted-foreground">{row.item_code}</span>
          ) : null}
        </div>
      ),
    },
    {
      id: "required",
      header: "Demandé restant",
      numeric: true,
      sortValue: (row) => row.required,
      cell: (row) => (
        <span>
          {formatQuantity(row.required)}
          {row.uom ? ` ${row.uom}` : ""}
        </span>
      ),
    },
    {
      id: "warehouse",
      header: "Entrepôt",
      hideBelow: "md",
      sortValue: (row) => row.warehouse || "",
      cell: (row) => <span className="truncate">{row.warehouse || "—"}</span>,
    },
    {
      id: "available",
      header: "Disponible",
      numeric: true,
      sortValue: (row) => row.available,
      cell: (row) => formatQuantity(row.available),
    },
    {
      id: "status",
      header: "État",
      sortValue: (row) => (lineIsShort(row) ? 1 : 0),
      cell: (row) =>
        lineIsShort(row) ? (
          <StatusBadge tone="danger" size="sm">
            Rupture
          </StatusBadge>
        ) : (
          <StatusBadge tone="success" size="sm">
            OK
          </StatusBadge>
        ),
    },
    {
      id: "pick_list",
      header: "Liste",
      sortValue: (row) => row.pick_list || "",
      cell: (row) =>
        row.pick_list ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={`Ouvrir ${row.pick_list}`}
            disabled={modified}
            onClick={() => navigate(`/preparation?pick_lists=${row.pick_list}`)}
          >
            {row.pick_list}
          </Button>
        ) : (
          <span className="text-muted-foreground">Sans liste</span>
        ),
    },
  ];

  const handleCreate = async () => {
    if (!order || !canCreate || order.has_available_stock === false) return;
    setErrorMessage("");
    try {
      const session = await createPickList([order.name]);
      const pickLists = (session?.pick_lists || [])
        .map((pickList) => pickList?.name)
        .filter((listName): listName is string => Boolean(listName));
      if (!pickLists.length) {
        throw new Error("La création n’a retourné aucune liste de prélèvement. Rechargez la page puis réessayez.");
      }
      navigate(`/preparation?pick_lists=${pickLists.join(",")}&created=1`);
    } catch (mutationError) {
      setConfirming(false);
      setErrorMessage(apiErrorMessage(mutationError));
    }
  };

  const handleAcknowledge = async () => {
    if (!order) return;
    setErrorMessage("");
    try {
      await acknowledgeModification(order.name);
      await mutate();
    } catch (mutationError) {
      setErrorMessage(apiErrorMessage(mutationError));
    }
  };

  if (isLoading && !order) {
    return (
      <div className="space-y-4" aria-hidden="true">
        <Skeleton className="h-20 w-full rounded-lg" />
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Commande introuvable"
        description={error ? apiErrorMessage(error) : "Cette fiche n’existe pas."}
        action={
          <Button variant="outline" onClick={goBack}>
            <ArrowLeft />
            Retour à la préparation
          </Button>
        }
      />
    );
  }

  const place = [order.custom_commune_nom || order.custom_commune, order.custom_wilaya].filter(Boolean).join(" · ") || "—";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Préparation"
        title={order.name}
        description={order.customer_name || order.customer || "Client non renseigné"}
        breadcrumb={
          <Button variant="ghost" size="sm" onClick={goBack}>
            <ArrowLeft />
            Préparation
          </Button>
        }
        meta={
          <>
            <StatusBadge tone={desk.tone}>{desk.label}</StatusBadge>
            <StatusBadge tone={pick.tone}>{pick.label}</StatusBadge>
            {orderIsModified(order) ? (
              <StatusBadge tone="warning">Modifiée</StatusBadge>
            ) : null}
            {shortages.length > 0 ? (
              <StatusBadge tone="danger">Stock insuffisant</StatusBadge>
            ) : (
              <StatusBadge tone="success">Stock OK</StatusBadge>
            )}
          </>
        }
        actions={
          lists.length ? (
            <Button
              variant="outline"
              onClick={() => navigate(`/preparation?pick_lists=${lists.join(",")}`)}
              disabled={modified}
            >
              <ClipboardList />
              {lists.length > 1 ? "Ouvrir les listes" : "Ouvrir la liste"}
            </Button>
          ) : canCreate ? (
            <Button onClick={() => setConfirming(true)} disabled={creating}>
              <ClipboardList />
              {creating ? "Création…" : "Créer la liste de prélèvement"}
            </Button>
          ) : null
        }
      />

      {modified && (
        <OrderModifiedAlert accepting={acknowledging} onAccept={() => void handleAcknowledge()} />
      )}

      {errorMessage && (
        <p role="alert" className="flex gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="size-4 shrink-0" />
          {errorMessage}
        </p>
      )}

      <section aria-label="Synthèse de la commande" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Client" value={order.customer_name || order.customer || "—"} hint={order.customer && order.customer_name ? order.customer : undefined} />
        <SummaryCard label="Lieu" value={place} />
        <SummaryCard
          label="Date"
          value={formatShortDate(order.delivery_date || order.transaction_date) || "—"}
          hint={order.delivery_date ? "Échéance" : "Date de commande"}
        />
        <SummaryCard
          label="Prélevé"
          value={`${percent} %`}
          hint={`${formatQuantity(picked)} / ${formatQuantity(requested)}`}
        />
      </section>

      <section aria-label="Lignes à prélever">
        <h2 className="mb-3 text-base font-semibold">Articles ({order.items?.length || 0})</h2>
        <DataTable
          label="Lignes à prélever"
          columns={itemColumns}
          rows={order.items || []}
          rowKey={(row) => `${row.item_code}-${row.warehouse || ""}`}
          empty={
            <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
              <Package className="size-4" />
              Aucune ligne à prélever.
            </p>
          }
        />
      </section>

      <CreatePickListDialog
        open={confirming}
        orders={[order]}
        creating={creating}
        onOpenChange={setConfirming}
        onConfirm={handleCreate}
      />
    </div>
  );
}
