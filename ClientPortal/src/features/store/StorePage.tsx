import { useState } from "react"
import { Search } from "lucide-react"
import { EmptyState, ErrorState, LoadingCards } from "@/components/LoadState"
import { PageTitle } from "@/components/PageTitle"
import { Paginator } from "@/components/Paginator"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ProductCard } from "@/features/store/ProductCard"
import { useCatalog } from "@/shared/api"

export function StorePage() {
  const [search, setSearch] = useState("")
  const [group, setGroup] = useState("all")
  const [page, setPage] = useState(1)
  const { data, isLoading, error } = useCatalog(search, group === "all" ? "" : group, page)
  const catalog = data?.message

  return (
    <>
      <PageTitle title="Catalogue" description="Tous les articles disponibles à la commande." />
      <div className="grid gap-3 rounded-xl border bg-muted/30 p-3 sm:grid-cols-[minmax(0,1fr)_260px]">
        <InputGroup className="bg-background">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setPage(1)
            }}
            placeholder="Rechercher un article…"
            aria-label="Rechercher un article"
          />
        </InputGroup>
        <Select
          value={group}
          onValueChange={(value) => {
            setGroup(String(value || "all"))
            setPage(1)
          }}
        >
          <SelectTrigger className="w-full bg-background">
            <SelectValue placeholder="Tous les groupes" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectItem value="all">Tous les groupes</SelectItem>
              {catalog?.groups.map((name) => (
                <SelectItem key={name} value={name}>
                  {name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      {isLoading && <LoadingCards />}
      {error && <ErrorState error={error} />}
      {catalog && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {catalog.items.map((item) => (
              <ProductCard key={item.itemCode} item={item} />
            ))}
          </div>
          {catalog.items.length === 0 && (
            <EmptyState title="Aucun article" description="Aucun article ne correspond à votre recherche." />
          )}
          <Paginator page={catalog.page} hasNext={catalog.hasNext} onChange={setPage} />
        </>
      )}
    </>
  )
}
