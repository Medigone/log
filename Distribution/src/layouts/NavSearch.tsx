import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Search } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { groupedNavItems } from "@/layouts/navItems"
import type { DistributionRole } from "@/shared/types/distribution"

function isMacShortcut() {
  return typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)
}

function matchesQuery(label: string, query: string) {
  return label.toLocaleLowerCase("fr-FR").includes(query.toLocaleLowerCase("fr-FR").trim())
}

export function NavSearch({
  role,
  showTrigger = true,
}: {
  role: DistributionRole
  showTrigger?: boolean
}) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const groups = useMemo(() => groupedNavItems(role), [role])
  const shortcut = isMacShortcut() ? "⌘K" : "Ctrl K"

  const results = useMemo(
    () =>
      groups
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => matchesQuery(item.label, query)),
        }))
        .filter((group) => group.items.length > 0),
    [groups, query],
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  const go = (to: string) => {
    setOpen(false)
    setQuery("")
    navigate(to)
  }

  return (
    <>
      {showTrigger && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="mt-2 flex h-[30px] w-full items-center gap-2 rounded-lg border border-hairline bg-background px-2.5 text-[12.5px] text-muted-foreground hover:border-input hover:bg-card"
        >
          <Search className="size-3.5" />
          <span className="truncate">Rechercher</span>
          <div className="flex-1" />
          <kbd className="num rounded border border-hairline bg-card px-1 text-[10.5px]">{shortcut}</kbd>
        </button>
      )}

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setQuery("")
        }}
      >
        <DialogContent showCloseButton={false} className="gap-3 p-3" size="sm:max-w-md">
          <DialogHeader className="sr-only">
            <DialogTitle>Rechercher une page</DialogTitle>
            <DialogDescription>Aller à une page de la console.</DialogDescription>
          </DialogHeader>
          <label className="flex h-9 items-center gap-2 rounded-lg border border-input px-2.5">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && results[0]?.items[0]) {
                  event.preventDefault()
                  go(results[0].items[0].to)
                }
              }}
              placeholder="Rechercher une page…"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </label>
          <div className="max-h-72 overflow-y-auto">
            {results.length === 0 ? (
              <p className="px-2 py-3 text-sm text-muted-foreground">Aucun résultat</p>
            ) : (
              results.map((group) => (
                <div key={group.group} className="mb-2 last:mb-0">
                  <p className="px-2 py-1 text-[10px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
                    {group.label}
                  </p>
                  {group.items.map((item) => {
                    const Icon = item.icon
                    return (
                      <button
                        key={item.to}
                        type="button"
                        onClick={() => go(item.to)}
                        className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-muted"
                      >
                        <Icon className="size-4 text-muted-foreground" />
                        {item.label}
                      </button>
                    )
                  })}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
