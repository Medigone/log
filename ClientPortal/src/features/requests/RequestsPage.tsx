import { useEffect, useState } from "react"
import { NavLink } from "react-router-dom"
import { Plus, Search, X } from "lucide-react"
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
import { SortSelector } from "@/features/orders/SortSelector"
import { useCatalogRequests } from "@/shared/api"
import { formatDate } from "@/shared/format"
import { paramOrAll, parseSort, useListQuery } from "@/shared/listQuery"

const STATUS_OPTIONS = [
  { value: "all", label: "Tous les statuts" },
  { value: "Ouverte", label: "Ouverte" },
  { value: "En cours", label: "En cours" },
  { value: "Commande créée", label: "Commande créée" },
  { value: "Refusée", label: "Refusée" },
] as const

const SORT_FIELDS = [
  { value: "date", label: "Date de demande" },
  { value: "delivery", label: "Date de livraison" },
  { value: "qty", label: "Articles" },
] as const

export function RequestsPage() {
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

  const { data, isLoading, error } = useCatalogRequests({
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

  const newButton = (
    <Button render={<NavLink to="/requests/new" />} nativeButton={false}>
      <Plus data-icon="inline-start" />
      Nouvelle demande
    </Button>
  )

  const empty = hasFilters ? (
    <EmptyState
      title="Aucune demande ne correspond"
      description="Modifiez ou réinitialisez les filtres pour afficher d’autres demandes."
      action={
        <Button variant="outline" onClick={reset}>
          <X data-icon="inline-start" />
          Réinitialiser
        </Button>
      }
    />
  ) : (
    <EmptyState
      title="Aucune demande"
      description="Si un article n’est pas au catalogue, envoyez une demande à l’équipe."
      action={newButton}
    />
  )

  return (
    <>
      <PageTitle
        title="Demandes"
        description="Demandez un article absent de la boutique. Notre équipe le traite puis crée la commande."
        action={newButton}
      />
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-2">
        <InputGroup className="min-w-48 flex-1 bg-background">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            id="request-search"
            value={searchDraft}
            onChange={(event) => setSearchDraft(event.target.value)}
            placeholder="Rechercher une demande…"
            aria-label="Rechercher une demande"
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
          getKey={(item) => item.name}
          href={(item) => `/requests/${item.name}`}
          title={(item) => item.name}
          meta={(item) =>
            [
              formatDate(item.creation),
              item.deliveryDate ? `Livraison ${formatDate(item.deliveryDate)}` : "",
              `${item.itemCount} article${item.itemCount > 1 ? "s" : ""}`,
            ]
              .filter(Boolean)
              .join(" · ")
          }
          status={(item) => item.status}
          sort={{ field: sortField, dir: sortDir }}
          onSort={(field, dir) => patch({ sort: field, dir, page: 1 })}
          columns={[
            { header: "Demande", cell: (item) => <span className="font-medium">{item.name}</span> },
            { header: "Date", sortKey: "date", cell: (item) => formatDate(item.creation) },
            { header: "Livraison", sortKey: "delivery", cell: (item) => formatDate(item.deliveryDate) },
            { header: "Articles", sortKey: "qty", className: "text-right", cell: (item) => item.itemCount },
            { header: "Statut", cell: (item) => <StatusBadge status={item.status} /> },
          ]}
        />
      )}
      {result && <Paginator page={result.page} hasNext={result.hasNext} onChange={(next) => patch({ page: next })} />}
    </>
  )
}
