import { Warehouse } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import type { CatalogItem, ItemStockRow } from "@/shared/api/catalog";
import { formatQuantity } from "@/shared/format";

export function ItemStockTab({ item }: { item: CatalogItem }) {
  const columns: Array<DataTableColumn<ItemStockRow>> = [
    { id: "warehouse", header: "Entrepôt", cell: (row) => <span className="font-medium">{row.warehouse}</span> },
    { id: "actual", header: "En stock", width: "120px", align: "right", numeric: true, cell: (row) => formatQuantity(row.actual_qty) },
    { id: "reserved", header: "Réservé", width: "120px", align: "right", numeric: true, hideBelow: "sm", cell: (row) => formatQuantity(row.reserved_qty) },
    {
      id: "available",
      header: "Disponible",
      width: "120px",
      align: "right",
      numeric: true,
      cell: (row) => <span className={row.available_qty > 0 ? "font-medium" : "text-red-700"}>{formatQuantity(row.available_qty)}</span>,
    },
  ];
  const total = item.stock.reduce((sum, row) => sum + row.actual_qty, 0);

  return (
    <DataTable
      label="Stock par entrepôt"
      columns={columns}
      rows={item.stock}
      rowKey={(row) => row.warehouse}
      footer={
        item.stock.length > 1 ? (
          <span className="num font-medium">
            Total : {formatQuantity(total)} {item.stock_uom}
          </span>
        ) : undefined
      }
      empty={<EmptyState icon={Warehouse} title="Aucun stock" description="Le stock apparaît après la première réception." />}
    />
  );
}
