import type { DataTableColumn } from "@/components/ui/data-table";
import { Money } from "@/components/ui/money";
import { StatusBadge } from "@/components/ui/status-badge";
import { cashStatusTone } from "@/shared/design/statusTone";
import { formatMoney } from "@/shared/format";
import type { DistributionRoute } from "@/shared/types/distribution";
import { formatSignedMoney, paymentClientCount, routeDeclaredGap } from "@/features/cashier/cashTotals";

function dayMonth(iso?: string) {
  if (!iso) return "—";
  const [, month, day] = iso.slice(0, 10).split("-");
  return day && month ? `${day}/${month}` : iso;
}

function dashOrMoney(value: number) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <Money value={value} precise />;
}

export function cashierRouteColumns(): Array<DataTableColumn<DistributionRoute>> {
  return [
    {
      id: "route",
      header: "Tournée · Livreur",
      width: "220px",
      sortValue: (route) => route.name,
      cell: (route) => (
        <div className="min-w-0">
          <p className="num truncate text-[12.5px] font-medium">{route.name}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            {route.driverName || "Livreur non affecté"} · {route.vehicleLabel || "Véhicule non affecté"}
          </p>
        </div>
      ),
    },
    {
      id: "date",
      header: "Date",
      width: "76px",
      sortValue: (route) => route.date,
      cell: (route) => <span className="num whitespace-nowrap text-xs">{dayMonth(route.date)}</span>,
    },
    {
      id: "payments",
      header: "Encaissements",
      width: "104px",
      sortValue: (route) => paymentClientCount(route),
      cell: (route) => {
        const count = paymentClientCount(route);
        return (
          <div>
            <p className="num text-xs">{count}</p>
            <p className="text-[11px] text-muted-foreground">{count === 0 ? "aucun" : count > 1 ? "clients" : "client"}</p>
          </div>
        );
      },
    },
    {
      id: "split",
      header: "Espèces / Chèques",
      width: "152px",
      align: "right",
      numeric: true,
      sortValue: (route) => route.cash.declaredTotal,
      cell: (route) => (
        <p className="num whitespace-nowrap text-xs">
          {dashOrMoney(route.cash.declaredCash)}
          <span className="px-1 text-[#d4d4d8]">/</span>
          {dashOrMoney(route.cash.declaredCheques)}
        </p>
      ),
    },
    {
      id: "declared",
      header: "Déclaré",
      width: "128px",
      align: "right",
      numeric: true,
      sortValue: (route) => route.cash.declaredTotal,
      cell: (route) => {
        const gap = routeDeclaredGap(route);
        return (
          <div>
            {route.cash.declaredTotal ? (
              <p className="num text-[13px] font-medium">{formatMoney(route.cash.declaredTotal, { precise: true })}</p>
            ) : (
              <p className="text-muted-foreground">—</p>
            )}
            {gap != null ? (
              <p className="num text-[11px] text-red-700">écart {formatSignedMoney(gap)}</p>
            ) : route.cash.status === "Validée" ? (
              <p className="text-[11px] text-muted-foreground">comptabilisé</p>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "status",
      header: "État",
      width: "156px",
      sortValue: (route) => route.cash.status,
      cell: (route) => (
        <StatusBadge tone={cashStatusTone(route.cash.status)} size="sm">
          {route.cash.status}
        </StatusBadge>
      ),
    },
    {
      id: "open",
      header: "",
      width: "26px",
      align: "right",
      cell: () => <span className="text-[13px] text-slate-600">›</span>,
    },
  ];
}
