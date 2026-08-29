import { useState } from "react"
import { Link, useMatch, useSearchParams } from "react-router-dom"
import { LayoutGrid } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty"
import { Item, ItemContent, ItemGroup, ItemTitle } from "@/components/ui/item"
import { Separator } from "@/components/ui/separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { NavUser } from "@/layouts/NavUser"
import { isStoreNavActive, storeNav } from "@/layouts/storeNav"
import { cn } from "@/lib/utils"
import { useStorefront } from "@/shared/api"
import type { PortalContext } from "@/shared/types"

const tabClassName = "flex h-auto min-h-14 flex-1 flex-col gap-1 rounded-none py-2 text-xs font-medium"

export function MobileBottomNav({ context }: { context: PortalContext }) {
  const [params] = useSearchParams()
  const onStorefront = Boolean(useMatch({ path: "/", end: true }))
  const storefront = useStorefront()
  const categories = storefront.data?.message?.categories ?? []
  const group = params.get("group") || ""
  const view = params.get("view") || ""
  const [rayonsOpen, setRayonsOpen] = useState(false)
  const rayonsActive = onStorefront && Boolean(group)

  return (
    <nav aria-label="Navigation boutique" className="fixed inset-x-0 bottom-0 z-40 bg-background pb-[env(safe-area-inset-bottom)] md:hidden">
      <Separator />
      <div className="flex items-stretch">
        <div role="group" aria-label="Boutique" className="flex min-w-0 flex-1">
          {storeNav.map((item) => {
            const Icon = item.icon
            const active = isStoreNavActive(item, onStorefront, view, group)
            return (
              <Button
                key={item.label}
                variant="ghost"
                nativeButton={false}
                render={<Link to={item.to} />}
                aria-current={active ? "page" : undefined}
                className={cn(tabClassName, active ? "text-foreground" : "text-muted-foreground")}
              >
                <Icon />
                {item.label}
              </Button>
            )
          })}
          <Sheet open={rayonsOpen} onOpenChange={setRayonsOpen}>
            <SheetTrigger
              render={
                <Button
                  variant="ghost"
                  className={cn(tabClassName, rayonsActive ? "text-foreground" : "text-muted-foreground")}
                />
              }
            >
              <LayoutGrid />
              Rayons
            </SheetTrigger>
            <SheetContent side="bottom" className="max-h-[70vh] gap-0 overflow-y-auto">
              <SheetHeader>
                <SheetTitle>Rayons</SheetTitle>
                <SheetDescription>Choisir un rayon du catalogue.</SheetDescription>
              </SheetHeader>
              {storefront.isLoading && (
                <div className="flex flex-col gap-2 px-4 pb-4">
                  {["a", "b", "c"].map((key) => (
                    <Skeleton key={key} className="h-10 rounded-lg" />
                  ))}
                </div>
              )}
              {!storefront.isLoading && categories.length === 0 && (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>Aucun rayon</EmptyTitle>
                    <EmptyDescription>Les rayons apparaîtront ici.</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
              {categories.length > 0 && (
                <ItemGroup className="gap-1 px-2 pb-4">
                  {categories.map((category) => (
                    <Item
                      key={category.name}
                      size="sm"
                      variant={group === category.name ? "muted" : "default"}
                      render={<Link to={`/?group=${encodeURIComponent(category.name)}`} />}
                      onClick={() => setRayonsOpen(false)}
                    >
                      <ItemContent>
                        <ItemTitle>{category.name}</ItemTitle>
                      </ItemContent>
                    </Item>
                  ))}
                </ItemGroup>
              )}
            </SheetContent>
          </Sheet>
        </div>
        <Separator orientation="vertical" className="my-2" />
        <div className="flex shrink-0 items-center px-2">
          <NavUser context={context} variant="bar" />
        </div>
      </div>
    </nav>
  )
}
