import type { DataTableColumn } from "@/components/ui/data-table";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  cashState,
  cashStateTone,
  dayMonth,
  driverInitials,
  signedBalance,
} from "@/features/cashier/driverCashTotals";
import { cashMovementTone, TONES } from "@/shared/design/statusTone";
import type { DriverCashBox } from "@/shared/types/distribution";
import { cn } from "@/lib/utils";

const AVATAR: Record<string, string> = {
  "À remettre": "bg-amber-100 text-amber-800",
  "À zéro": "bg-slate-100 text-slate-600",
  Négatif: "bg-red-100 text-red-800",
  Inactif: "bg-slate-50 text-slate-400",
};

export function driverCashColumns(onHandover: (box: DriverCashBox) => void): Array<DataTableColumn<DriverCashBox>> {
  return [
    {
      id: "driver",
      header: "Livreur",
      width: "180px",
      cell: (box) => {
        const state = cashState(box);
        return (
          <div className="flex min-w-0 items-center gap-2.5">
            <span className={cn("grid size-[26px] shrink-0 place-items-center rounded-full text-[10px] font-semibold", AVATAR[state])}>
              {driverInitials(box.driverName || box.driver)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[13px] font-medium">{box.driverName}</p>
              <p className="num truncate text-[10.5px] text-muted-foreground">{box.driver}</p>
            </div>
          </div>
        );
      },
    },
    {
      id: "balance",
      header: "Solde",
      width: "120px",
      align: "right",
      numeric: true,
      cell: (box) => (
        <span
          className={cn(
            "num text-[14px] font-medium",
            box.balance < 0 ? "text-red-700" : box.balance === 0 ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {signedBalance(box.balance)}
        </span>
      ),
    },
    {
      id: "state",
      header: "État",
      width: "112px",
      cell: (box) => {
        const state = cashState(box);
        return (
          <StatusBadge tone={cashStateTone(state)} size="sm">
            {state}
          </StatusBadge>
        );
      },
    },
    {
      id: "movement",
      header: "Dernier mouvement",
      width: "190px",
      cell: (box) => {
        const movement = box.lastMovement;
        if (!movement) return <span className="text-muted-foreground">—</span>;
        const tone = cashMovementTone(movement.type);
        return (
          <div className="min-w-0">
            <p className={cn("truncate text-[12.5px]", TONES[tone].text)}>
              {movement.type} {signedBalance(movement.amount).replace(/\s?DZD$/, "")}
            </p>
            <p className="num truncate whitespace-nowrap text-[10.5px] text-muted-foreground">
              {dayMonth(movement.date)}
              {movement.routeId ? ` · ${movement.routeId}` : ""}
            </p>
          </div>
        );
      },
    },
    {
      id: "route",
      header: "Tournée du jour",
      width: "116px",
      cell: (box) =>
        box.todayRouteId ? (
          <span className="num whitespace-nowrap text-[11.5px]">{box.todayRouteId}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    {
      id: "action",
      header: "",
      width: "72px",
      cell: (box) =>
        box.balance > 0 ? (
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="h-[26px]"
            onClick={(event) => {
              event.stopPropagation();
              onHandover(box);
            }}
          >
            Remettre
          </Button>
        ) : null,
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

export function driverCashFooter(total: number) {
  return (
    <TableRow className="bg-surface-subtle hover:bg-surface-subtle">
      <TableCell className="text-[12.5px] font-medium">Total des caisses affichées</TableCell>
      <TableCell className="num text-right text-[14px] font-medium">{signedBalance(total)}</TableCell>
      <TableCell />
      <TableCell />
      <TableCell />
      <TableCell />
      <TableCell />
    </TableRow>
  );
}
