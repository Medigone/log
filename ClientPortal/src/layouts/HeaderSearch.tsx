import { useEffect, useId, useMemo, useState } from "react"
import { useLocation, useNavigate, useSearchParams } from "react-router-dom"
import { LayoutGrid, Search, X } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Spinner } from "@/components/ui/spinner"
import { useCatalog, useStorefront } from "@/shared/api"
import { cn } from "@/lib/utils"
import type { CatalogItem } from "@/shared/types"

export function foldSearchTerm(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
}

type Suggestion =
  | { kind: "group"; name: string }
  | { kind: "item"; item: CatalogItem }
  | { kind: "all" }

function suggestionKey(suggestion: Suggestion) {
  if (suggestion.kind === "group") return `group:${suggestion.name}`
  if (suggestion.kind === "item") return `item:${suggestion.item.itemCode}`
  return "all"
}

export function HeaderSearch() {
  const location = useLocation()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const listId = useId()
  const urlQuery = params.get("q") || ""
  const group = params.get("group") || ""
  const searchString = params.toString()
  const [value, setValue] = useState(urlQuery)
  const [debounced, setDebounced] = useState(urlQuery.trim())
  const [open, setOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const storefront = useStorefront()
  const categories = storefront.data?.message?.categories ?? []
  const term = value.trim()
  const itemsReady = open && debounced === term && debounced.length >= 2
  const catalog = useCatalog(debounced, group, 1, itemsReady, 5)
  const items = itemsReady ? catalog.data?.message?.items ?? [] : []
  const waitingItems = term.length >= 2 && (debounced !== term || Boolean(catalog.isLoading))

  useEffect(() => {
    setValue(urlQuery)
  }, [urlQuery])

  useEffect(() => {
    const handle = window.setTimeout(() => setDebounced(value.trim()), 300)
    return () => window.clearTimeout(handle)
  }, [value])

  const matchingGroups = useMemo(() => {
    if (!term) return []
    const folded = foldSearchTerm(term)
    return categories.filter((category) => category.name !== group && foldSearchTerm(category.name).includes(folded))
  }, [categories, group, term])

  const suggestions = useMemo<Suggestion[]>(() => {
    if (!term) return []
    const next: Suggestion[] = matchingGroups.map((category) => ({ kind: "group", name: category.name }))
    if (debounced.length >= 2 && debounced === term) {
      for (const item of items) next.push({ kind: "item", item })
    }
    next.push({ kind: "all" })
    return next
  }, [debounced.length, items, matchingGroups, term])

  useEffect(() => {
    setActiveIndex(-1)
  }, [term])

  const active = activeIndex >= 0 ? suggestions[activeIndex] : undefined

  function goToGroup(name: string) {
    setValue("")
    setOpen(false)
    setActiveIndex(-1)
    navigate(`/?group=${encodeURIComponent(name)}`)
  }

  function goToItem(itemCode: string) {
    setOpen(false)
    setActiveIndex(-1)
    navigate(`/products/${encodeURIComponent(itemCode)}`)
  }

  function submitSearch() {
    const next = value.trim()
    setOpen(false)
    setActiveIndex(-1)
    const nextParams = new URLSearchParams(location.pathname === "/" ? searchString : "")
    if (next) nextParams.set("q", next)
    else nextParams.delete("q")
    nextParams.delete("view")
    if (group && location.pathname !== "/") nextParams.set("group", group)
    const search = nextParams.toString()
    navigate({ pathname: "/", search: search ? `?${search}` : "" })
  }

  function clearQuery() {
    if (!urlQuery) return
    const nextParams = new URLSearchParams(location.pathname === "/" ? searchString : "")
    nextParams.delete("q")
    nextParams.delete("view")
    if (group && location.pathname !== "/") nextParams.set("group", group)
    const search = nextParams.toString()
    navigate({ pathname: "/", search: search ? `?${search}` : "" }, { replace: true })
  }

  function clearGroup() {
    const nextParams = new URLSearchParams(searchString)
    nextParams.delete("group")
    const search = nextParams.toString()
    navigate({ pathname: location.pathname, search: search ? `?${search}` : "" })
  }

  function selectSuggestion(suggestion: Suggestion) {
    if (suggestion.kind === "group") goToGroup(suggestion.name)
    else if (suggestion.kind === "item") goToItem(suggestion.item.itemCode)
    else submitSearch()
  }

  const showList = open && Boolean(term)

  return (
    <div className="relative min-w-0 w-full max-w-2xl flex-1">
      <InputGroup className="bg-background">
        <InputGroupAddon>
          <Search />
        </InputGroupAddon>
        {group ? (
          <InputGroupAddon>
            <Badge variant="secondary">
              <span className="max-w-24 truncate">{group}</span>
              <button
                type="button"
                aria-label={`Retirer le rayon ${group}`}
                onClick={clearGroup}
              >
                <X data-icon="inline-end" />
              </button>
            </Badge>
          </InputGroupAddon>
        ) : null}
        <InputGroupInput
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={active ? `${listId}-${suggestionKey(active)}` : undefined}
          autoComplete="off"
          value={value}
          onChange={(event) => {
            const next = event.target.value
            setValue(next)
            setOpen(Boolean(next.trim()))
            if (!next.trim()) clearQuery()
          }}
          onFocus={() => {
            if (term) setOpen(true)
          }}
          onBlur={() => {
            window.setTimeout(() => {
              setOpen(false)
              setActiveIndex(-1)
            }, 120)
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault()
              setOpen(false)
              setActiveIndex(-1)
              return
            }
            if (event.key === "ArrowDown") {
              event.preventDefault()
              if (!term) return
              setOpen(true)
              setActiveIndex((index) => (index + 1) % Math.max(suggestions.length, 1))
              return
            }
            if (event.key === "ArrowUp") {
              event.preventDefault()
              if (!term) return
              setOpen(true)
              setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1))
              return
            }
            if (event.key === "Enter") {
              event.preventDefault()
              if (active) selectSuggestion(active)
              else submitSearch()
            }
          }}
          placeholder="Rechercher un article, une référence ou un rayon…"
          aria-label="Rechercher un article, une référence ou un rayon"
        />
        {waitingItems ? (
          <InputGroupAddon align="inline-end">
            <Spinner className="size-4" />
          </InputGroupAddon>
        ) : null}
        {value ? (
          <InputGroupAddon align="inline-end">
            <button
              type="button"
              aria-label="Effacer la recherche"
              onClick={() => {
                setValue("")
                setOpen(false)
                setActiveIndex(-1)
                clearQuery()
              }}
            >
              <X />
            </button>
          </InputGroupAddon>
        ) : null}
      </InputGroup>
      {showList && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-80 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-md"
        >
          {matchingGroups.length > 0 && (
            <li className="px-2.5 py-1 text-xs font-medium text-muted-foreground">Rayons</li>
          )}
          {matchingGroups.map((category) => {
            const suggestion: Suggestion = { kind: "group", name: category.name }
            const selected = active?.kind === "group" && active.name === category.name
            return (
              <li key={category.name} role="option" id={`${listId}-${suggestionKey(suggestion)}`} aria-selected={selected}>
                <button
                  type="button"
                  className={cn("flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted", selected && "bg-muted")}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectSuggestion(suggestion)}
                >
                  <LayoutGrid className="size-4 text-muted-foreground" />
                  <span className="font-medium">{category.name}</span>
                </button>
              </li>
            )
          })}
          {items.length > 0 && (
            <li className="px-2.5 py-1 text-xs font-medium text-muted-foreground">Articles</li>
          )}
          {items.map((item) => {
            const suggestion: Suggestion = { kind: "item", item }
            const selected = active?.kind === "item" && active.item.itemCode === item.itemCode
            return (
              <li key={item.itemCode} role="option" id={`${listId}-${suggestionKey(suggestion)}`} aria-selected={selected}>
                <button
                  type="button"
                  className={cn("flex w-full flex-col rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted", selected && "bg-muted")}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectSuggestion(suggestion)}
                >
                  <span className="font-medium">{item.itemName}</span>
                  <span className="text-xs text-muted-foreground">{item.itemGroup}</span>
                </button>
              </li>
            )
          })}
          {matchingGroups.length === 0 && items.length === 0 && !waitingItems && (
            <li className="px-2.5 py-2 text-sm text-muted-foreground">Aucun rayon ni article.</li>
          )}
          <li role="option" id={`${listId}-all`} aria-selected={active?.kind === "all"}>
            <button
              type="button"
              className={cn("flex w-full rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted", active?.kind === "all" && "bg-muted")}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => submitSearch()}
            >
              Voir tous les résultats pour « {term} »
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}
