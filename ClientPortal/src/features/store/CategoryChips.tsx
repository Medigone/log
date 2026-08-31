import { NavLink } from "react-router-dom"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

function chipHref(params: URLSearchParams, group: string) {
  const next = new URLSearchParams(params)
  next.delete("view")
  next.delete("group")
  if (group) next.set("group", group)
  const search = next.toString()
  return search ? `/?${search}` : "/"
}

export function CategoryChips({
  groups,
  active,
  loading = false,
  params,
}: {
  groups: Array<{ name: string }>
  active: string
  loading?: boolean
  params: URLSearchParams
}) {
  if (loading) {
    return (
      <div className="flex gap-2 overflow-hidden" aria-hidden>
        {["a", "b", "c", "d", "e"].map((key) => (
          <Skeleton key={key} className="h-8 w-24 shrink-0 rounded-full" />
        ))}
      </div>
    )
  }
  if (groups.length === 0) return null

  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <Button
        size="sm"
        variant={active ? "outline" : "default"}
        className={cn("shrink-0 rounded-full", !active && "bg-foreground text-background hover:bg-foreground/90")}
        render={<NavLink to={chipHref(params, "")} />}
        nativeButton={false}
      >
        Tous
      </Button>
      {groups.map((group) => {
        const selected = active === group.name
        return (
          <Button
            key={group.name}
            size="sm"
            variant={selected ? "default" : "outline"}
            className={cn("shrink-0 rounded-full", selected && "bg-foreground text-background hover:bg-foreground/90")}
            render={<NavLink to={chipHref(params, group.name)} />}
            nativeButton={false}
          >
            {group.name}
          </Button>
        )
      })}
    </div>
  )
}
