import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import type { CommuneOption } from "@/shared/types"

export function CommunePicker({
  value,
  communes,
  onChange,
  id = "customer-commune",
}: {
  value?: string | null
  communes: CommuneOption[]
  onChange: (commune: CommuneOption) => void
  id?: string
}) {
  const selected = communes.find((commune) => commune.name === value)
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    const source = term
      ? communes.filter(
          (commune) =>
            commune.nom.toLowerCase().includes(term) ||
            commune.wilaya.toLowerCase().includes(term) ||
            (commune.wilayaName || "").toLowerCase().includes(term),
        )
      : communes
    return source.slice(0, 20)
  }, [communes, query])

  return (
    <div className="relative">
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls="commune-list"
        autoComplete="off"
        placeholder="Rechercher une commune…"
        value={open ? query : selected?.nom || query}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onFocus={() => {
          setQuery(selected?.nom || "")
          setOpen(true)
        }}
        onBlur={() => {
          window.setTimeout(() => {
            setOpen(false)
            setQuery("")
          }, 120)
        }}
      />
      {open && (
        <ul
          id="commune-list"
          role="listbox"
          className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border bg-popover p-1 shadow-md"
        >
          {filtered.length === 0 && (
            <li className="px-2.5 py-2 text-sm text-muted-foreground">Aucune commune trouvée.</li>
          )}
          {filtered.map((commune) => (
            <li key={commune.name} role="option" aria-selected={commune.name === value}>
              <button
                type="button"
                className="flex w-full flex-col rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-muted"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  onChange(commune)
                  setQuery("")
                  setOpen(false)
                }}
              >
                <span className="font-medium">{commune.nom}</span>
                <span className="text-xs text-muted-foreground">{commune.wilayaName || commune.wilaya}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
