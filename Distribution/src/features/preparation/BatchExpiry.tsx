import { cn } from "@/lib/utils";
import { formatShortDate } from "@/shared/format";

/** Lot + DLC d'une ligne de préparation ; badge orange quand la DLC est proche. */
export function BatchExpiry({
  batchNo,
  batchCount,
  expiryDate,
  expirySoon,
  className,
}: {
  batchNo?: string;
  /** Plusieurs lots pour un même article (vue sol) : affiche « N lots » et la DLC la plus courte. */
  batchCount?: number;
  expiryDate?: string;
  expirySoon?: boolean;
  className?: string;
}) {
  const label = batchCount && batchCount > 1 ? `${batchCount} lots` : batchNo ? `Lot ${batchNo}` : "";
  if (!label && !expiryDate) return null;
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground", className)}>
      <span className="num truncate">
        {[label, expiryDate ? `DLC ${formatShortDate(expiryDate)}` : ""].filter(Boolean).join(" · ")}
      </span>
      {expirySoon ? (
        <span className="shrink-0 whitespace-nowrap rounded-full border border-amber-500 bg-amber-50 px-1.5 text-[10px] font-medium text-amber-700">
          DLC proche
        </span>
      ) : null}
    </span>
  );
}
