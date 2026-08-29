import { useEffect, useState } from "react"
import { NavLink } from "react-router-dom"
import { Search, ShoppingBag, X } from "lucide-react"
import { DocumentList } from "@/components/DocumentList"
import { FilterSelect } from "@/components/FilterSelect"
import { EmptyState, ErrorState } from "@/components/LoadState"
import { PageTitle } from "@/components/PageTitle"
import { Paginator } from "@/components/Paginator"
import { StatusBadge } from "@/components/StatusBadge"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { DateRangeFilter } from "@/features/orders/DateRangeFilter"
import { OrderOriginIcon } from "@/features/orders/OrderOriginIcon"
import { SortSelector } from "@/features/orders/SortSelector"
import { useOrders } from "@/shared/api"
import { formatDate, formatMoney } from "@/shared/format"
import { paramOrAll, parseSort, useListQuery } from "@/shared/listQuery"

const STATUS_OPTIONS = [
  { value: "all", label: "Tous les statuts" },
  { value: "En attente de validation", label: "En attente de validation" },
  { value: "À livrer", label: "À livrer" },
  { value: "Livraison en cours", label: "Livraison en cours" },
  { value: "Partiellement Livré", label: "Partiellement livré" },
  { value: "Livré", label: "Livré" },
  { value: "En pause", label: "En pause" },
  { value: "Clôturé", label: "Clôturé" },
  { value: "Annulé", label: "Annulé" },
] as const

const SOURCE_OPTIONS = [
  { value: "all", label: "Toutes les origines" },
  { value: "Portail client", label: "Portail client" },
  { value: "Interne", label: "Interne" },
] as const

const SORT_FIELDS = [
  { value: "date", label: "Date de commande" },
  { value: "delivery", label: "Date de livraison" },
  { value: "amount", label: "Montant TTC" },
] as const

export function OrdersPage() {
  const { params, patch, reset } = useListQuery()
  const search = params.get("q") || ""
  const status = paramOrAll(params.get("status"))
  const source = paramOrAll(params.get("source"))
  const fromDate = params.get("from") || ""
  const toDate = params.get("to") || ""
  const { field: sortField, dir: sortDir } = parseSort(
    params,
    SORT_FIELDS.map((item) => item.value),
    "date",
  )
  const orderBy = `${sortField}_${sortDir}`
  const page = Math.max(Number(params.get("page") || "1") || 1, 1)
  const [searchDraft, setSearchDraft] = useState(search)

  useEffect(() => {
    setSearchDraft(search)
  }, [search])

  useEffect(() => {
    const handle = window.setTimeout(() => {
      if (searchDraft.trim() === search) return
      patch({ q: searchDraft.trim(), page: 1 })
    }, 300)
    return () => window.clearTimeout(handle)
  }, [patch, search, searchDraft])

  const { data, isLoading, error } = useOrders({
    page,
    search,
    status,
    source,
    fromDate,
    toDate,
    orderBy,
  })
  const result = data?.message
  const defaultSort = sortField === "date" && sortDir === "desc"
  const hasFilters = Boolean(search || status || source || fromDate || toDate || !defaultSort)

  const resetFilters = reset

  const newOrderButton = (
    <Button render={<NavLink to="/" />} nativeButton={false}>
      <ShoppingBag data-icon="inline-start" />
      Nouvelle commande
    </Button>
  )

  const empty = hasFilters ? (
    <EmptyState
      title="Aucune commande ne correspond"
      description="Modifiez ou réinitialisez les filtres pour afficher d’autres commandes."
      action={
        <Button variant="outline" onClick={resetFilters}>
          <X data-icon="inline-start" />
          Réinitialiser
        </Button>
      }
    />
  ) : (
    <EmptyState
      title="Aucune commande"
      description="Vos commandes apparaîtront ici après leur création."
      action={newOrderButton}
    />
  )

  return (
    <>
      <PageTitle
        title="Commandes"
        description="Toutes les commandes de votre compte, quelle que soit leur origine."
        action={newOrderButton}
      />
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-2">
        <InputGroup className="min-w-48 flex-1 bg-background">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            id="order-search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Rechercher une commande…"
            aria-label="Rechercher une commande"
          />
        </InputGroup>
        <FilterSelect
          label="Statut"
          value={status || "all"}
          options={STATUS_OPTIONS}
          onChange={(value) => patch({ status: value, page: 1 })}
        />
        <FilterSelect
          label="Origine"
          value={source || "all"}
          options={SOURCE_OPTIONS}
          onChange={(value) => patch({ source: value, page: 1 })}
        />
        <DateRangeFilter
          from={fromDate}
          to={toDate}
          onChange={(range) => patch({ from: range.from, to: range.to, page: 1 })}
        />
        <SortSelector
          className="md:ml-auto"
          field={sortField}
          dir={sortDir}
          fields={SORT_FIELDS}
          onFieldChange={(value) => patch({ sort: value, page: 1 })}
          onDirChange={(value) => patch({ dir: value, page: 1 })}
        />
        {hasFilters ? (
          <Button variant="ghost" size="sm" onClick={resetFilters}>
            <X data-icon="inline-start" />
            Réinitialiser
          </Button>
        ) : null}
      </div>
      {error && <ErrorState error={error} />}
      {isLoading && <Skeleton className="h-72 rounded-xl" />}
      {result?.items.length === 0 && empty}
      {result && result.items.length > 0 && (
        <DocumentList
          items={result.items}
          getKey={(order) => order.name}
          href={(order) => `/orders/${order.name}`}
          title={(order) => (
            <span className="inline-flex items-center gap-2">
              {order.name}
              <OrderOriginIcon source={order.source} />
            </span>
          )}
          meta={(order) =>
            [formatDate(order.transactionDate), `Livraison ${formatDate(order.deliveryDate)}`].filter(Boolean).join(" · ")
          }
          status={(order) => order.status}
          amount={(order) => formatMoney(order.totalTtc, order.currency)}
          sort={{ field: sortField, dir: sortDir }}
          onSort={(field, dir) => patch({ sort: field, dir, page: 1 })}
          columns={[
            {
              header: "Commande",
              cell: (order) => (
                <span className="inline-flex items-center gap-2 font-medium">
                  {order.name}
                  <OrderOriginIcon source={order.source} />
                </span>
              ),
            },
            { header: "Date", sortKey: "date", cell: (order) => formatDate(order.transactionDate) },
            { header: "Livraison", sortKey: "delivery", cell: (order) => formatDate(order.deliveryDate) },
            { header: "Statut", cell: (order) => <StatusBadge status={order.status} /> },
            {
              header: "Total TTC",
              sortKey: "amount",
              className: "text-right",
              cell: (order) => <span className="font-medium">{formatMoney(order.totalTtc, order.currency)}</span>,
            },
          ]}
        />
      )}
      {result && <Paginator page={result.page} hasNext={result.hasNext} onChange={(next) => patch({ page: next })} />}
    </>
  )
}
