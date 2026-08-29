import { useState } from "react"
import { Wallet } from "lucide-react"
import { DocumentList } from "@/components/DocumentList"
import { EmptyState, ErrorState } from "@/components/LoadState"
import { PageTitle } from "@/components/PageTitle"
import { Paginator } from "@/components/Paginator"
import { StatusBadge } from "@/components/StatusBadge"
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { useBalance, usePayments } from "@/shared/api"
import { formatDate, formatMoney } from "@/shared/format"
import type { Balance, PortalContext } from "@/shared/types"

function balanceCaption(amount: number) {
  if (amount > 0) return "Montant comptable à régler"
  if (amount < 0) return "Crédit disponible"
  return "Compte à jour"
}

function BalanceCard({ balance }: { balance: Balance }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>
          Solde actuel · {balance.company}
        </CardDescription>
        <CardTitle className="text-2xl font-semibold tracking-tight">
          {formatMoney(balance.amount, balance.currency)}
        </CardTitle>
        <CardAction>
          <Wallet className="size-5 text-muted-foreground" />
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">{balanceCaption(balance.amount)}</p>
      </CardContent>
    </Card>
  )
}

export function PaymentsPage({ context }: { context: PortalContext }) {
  const [page, setPage] = useState(1)
  const { data, isLoading, error } = usePayments(page)
  const { data: balanceData, isLoading: balanceLoading, error: balanceError } = useBalance()
  const result = data?.message
  const balances = balanceData?.message?.balances ?? context.balances

  return (
    <>
      <PageTitle title="Paiements" description="Paiements client enregistrés, y compris les opérations annulées." />
      {balanceError && !balances.length && <ErrorState error={balanceError} />}
      {balanceLoading && !balances.length && <Skeleton className="h-28 rounded-xl" />}
      {balances.length > 0 && (
        <section className={balances.length > 1 ? "grid gap-4 md:grid-cols-2" : "max-w-md"}>
          {balances.map((balance) => (
            <BalanceCard key={`${balance.company}-${balance.currency}`} balance={balance} />
          ))}
        </section>
      )}
      {error && <ErrorState error={error} />}
      {isLoading && <Skeleton className="h-72 rounded-xl" />}
      {result?.items.length === 0 && <EmptyState title="Aucun paiement" description="Les règlements enregistrés apparaîtront ici." />}
      {result && result.items.length > 0 && (
        <DocumentList
          items={result.items}
          getKey={(payment) => payment.name}
          title={(payment) => payment.name}
          meta={(payment) => [formatDate(payment.date), payment.method || null, payment.deliveryNote || null].filter(Boolean).join(" · ")}
          status={(payment) => payment.status}
          amount={(payment) => formatMoney(payment.amount, context.currency)}
          dimmed={(payment) => payment.status?.toLowerCase().includes("annul")}
          columns={[
            { header: "Date", cell: (payment) => formatDate(payment.date) },
            { header: "Paiement", cell: (payment) => <span className="font-medium">{payment.name}</span> },
            { header: "Moyen", cell: (payment) => payment.method || "—" },
            { header: "Bon lié", cell: (payment) => payment.deliveryNote || "—" },
            { header: "Statut", cell: (payment) => <StatusBadge status={payment.status} /> },
            { header: "Montant", className: "text-right", cell: (payment) => <span className="font-medium">{formatMoney(payment.amount, context.currency)}</span> },
          ]}
        />
      )}
      {result && <Paginator page={result.page} hasNext={result.hasNext} onChange={setPage} />}
    </>
  )
}
