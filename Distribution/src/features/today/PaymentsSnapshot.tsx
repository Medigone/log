import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/ui/money";
import type { ActivityPayments } from "@/shared/types/distribution";

export function PaymentsSnapshot({ payments }: { payments: ActivityPayments }) {
  const navigate = useNavigate();
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Paiements</CardTitle>
          <p className="t-body text-muted-foreground">Contrôle caisse et soldes livreurs.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/cashier")}>
          Caisse
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        <button
          type="button"
          onClick={() => navigate("/cashier")}
          className="flex w-full items-center justify-between rounded-md border border-hairline p-3 text-left hover:border-brand-300 hover:bg-brand-50/40"
        >
          <span>
            <p className="text-sm font-medium">À contrôler</p>
            <p className="t-meta text-muted-foreground">{payments.pendingPayments} paiement(s) en attente</p>
          </span>
          <span className="num text-lg font-semibold">{payments.toControl}</span>
        </button>
        <button
          type="button"
          onClick={() => navigate("/cashier")}
          className="flex w-full items-center justify-between rounded-md border border-hairline p-3 text-left hover:border-brand-300 hover:bg-brand-50/40"
        >
          <span>
            <p className="text-sm font-medium">Écarts</p>
            <p className="t-meta text-muted-foreground">Tournées à arbitrer</p>
          </span>
          <span className="num text-lg font-semibold text-red-700">{payments.discrepancies}</span>
        </button>
        <button
          type="button"
          onClick={() => navigate("/caisses")}
          className="flex w-full items-center justify-between rounded-md border border-hairline p-3 text-left hover:border-brand-300 hover:bg-brand-50/40"
        >
          <span>
            <p className="text-sm font-medium">Encaissé du jour</p>
            <p className="t-meta text-muted-foreground">
              {payments.driverCashBoxes} caisse(s) · solde <Money value={payments.driverCashTotal} />
            </p>
          </span>
          <Money value={payments.declaredToday} className="text-lg font-semibold" />
        </button>
      </CardContent>
    </Card>
  );
}
