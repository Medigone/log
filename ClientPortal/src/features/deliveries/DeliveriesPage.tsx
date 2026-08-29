import { useEffect, useState } from "react"
import { Search, X } from "lucide-react"
import { DocumentList } from "@/components/DocumentList"
import { FilterSelect } from "@/components/FilterSelect"
import { EmptyState, ErrorState } from "@/components/LoadState"
import { PageTitle } from "@/components/PageTitle"
import { Paginator } from "@/components/Paginator"
import { StatusBadge } from "@/components/StatusBadge"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Skeleton } from "@/components/ui/skeleton"
import { SalesOrderLinks, salesOrderLabel } from "@/features/deliveries/SalesOrderLinks"
import { DateRangeFilter } from "@/features/orders/DateRangeFilter"
import { SortSelector } from "@/features/orders/SortSelector"
import { useDeliveries } from "@/shared/api"
import { formatDate, formatMoney } from "@/shared/format"
import { paramOrAll, parseSort, useListQuery } from "@/shared/listQuery"

const STATUS_OPTIONS = [
  { value: "all", label: "Tous les statuts" },
  { value: "Brouillon", label: "Brouillon" },
  { value: "Nouveau", label: "Nouveau" },
  { value: "Préparé", label: "Préparé" },
  { value: "Enlevé", label: "Enlevé" },
  { value: "Livraison en cours", label: "Livraison en cours" },
  { value: "Partiellement Livré", label: "Partiellement livré" },
  { value: "Livré", label: "Livré" },
  { value: "Non Livré", label: "Non livré" },
  { value: "Retour", label: "Retour" },
  { value: "Annulé", label: "Annulé" },
  { value: "Clôturé", label: "Clôturé" },
] as const

const SORT_FIELDS = [
  { value: "date", label: "Date du bon" },
  { value: "qty", label: "Quantité" },
  { value: "amount", label: "Montant TTC" },
] as const

export function DeliveriesPage() {
  const { params, patch, reset } = useListQuery()
  const search = params.get("q") || ""
  const status = paramOrAll(params.get("status"))
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

  const { data, isLoading, error } = useDeliveries({
    page,
    search,
    status,
    fromDate,
    toDate,
    orderBy,
  })
  const result = data?.message
  const defaultSort = sortField === "date" && sortDir === "desc"
  const hasFilters = Boolean(search || status || fromDate || toDate || !defaultSort)

  const empty = hasFilters ? (
    <EmptyState
      title="Aucun bon ne correspond"
      description="Modifiez ou réinitialisez les filtres pour afficher d’autres livraisons."
      action={
        <Button variant="outline" onClick={reset}>
          <X data-icon="inline-start" />
          Réinitialiser
        </Button>
      }
    />
  ) : (
    <EmptyState title="Aucun bon de livraison" description="Les bons soumis apparaîtront ici." />
  )

  return (
    <>
      <PageTitle title="Bons de livraison" description="Historique complet des livraisons de votre compte." />
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-2">
        <InputGroup className="min-w-48 flex-1 bg-background">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            id="delivery-search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Rechercher un bon…"
            aria-label="Rechercher un bon de livraison"
          />
        </InputGroup>
        <FilterSelect
          label="Statut"
          value={status || "all"}
          options={STATUS_OPTIONS}
          onChange={(value) => patch({ status: value, page: 1 })}
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
          <Button variant="ghost" size="sm" onClick={reset}>
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
          getKey={(note) => note.name}
          href={(note) => `/deliveries/${note.name}`}
          title={(note) => note.name}
          meta={(note) =>
            [formatDate(note.postingDate), salesOrderLabel(note.salesOrders), `${note.totalQuantity} article(s)`]
              .filter(Boolean)
              .join(" · ")
          }
          status={(note) => note.status}
          amount={(note) => formatMoney(note.totalTtc, note.currency)}
          sort={{ field: sortField, dir: sortDir }}
          onSort={(field, dir) => patch({ sort: field, dir, page: 1 })}
          columns={[
            { header: "Bon", cell: (note) => <span className="font-medium">{note.name}</span> },
            { header: "Date", sortKey: "date", cell: (note) => formatDate(note.postingDate) },
            { header: "Commande", cell: (note) => <SalesOrderLinks names={note.salesOrders} /> },
            { header: "Statut", cell: (note) => <StatusBadge status={note.status} /> },
            { header: "Quantité", sortKey: "qty", cell: (note) => note.totalQuantity },
            {
              header: "Total TTC",
              sortKey: "amount",
              className: "text-right",
              cell: (note) => <span className="font-medium">{formatMoney(note.totalTtc, note.currency)}</span>,
            },
          ]}
        />
      )}
      {result && <Paginator page={result.page} hasNext={result.hasNext} onChange={(next) => patch({ page: next })} />}
    </>
  )
}
