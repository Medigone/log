import { NavLink, useMatch, useSearchParams } from "react-router-dom"
import { ChevronRight, LayoutGrid } from "lucide-react"
import { BrandLogo } from "@/components/BrandLogo"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { NavUser } from "@/layouts/NavUser"
import { isStoreNavActive, storeNav } from "@/layouts/storeNav"
import { useStorefront } from "@/shared/api"
import type { PortalContext } from "@/shared/types"

export function AppSidebar({ context }: { context: PortalContext }) {
  const { isMobile } = useSidebar()
  const [params] = useSearchParams()
  const onStorefront = Boolean(useMatch({ path: "/", end: true }))
  const storefront = useStorefront()
  const categories = storefront.data?.message?.categories ?? []
  const group = params.get("group") || ""
  const view = params.get("view") || ""

  if (isMobile) return null

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" render={<NavLink to="/" />} tooltip="IntraPro">
              <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <BrandLogo compact className="size-8" />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">IntraPro</span>
                <span className="truncate text-xs">Portail client</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Boutique</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {storeNav.map((item) => {
                const Icon = item.icon
                const active = isStoreNavActive(item, onStorefront, view, group)
                return (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton render={<NavLink to={item.to} end={item.view === null} />} isActive={active} tooltip={item.label}>
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
              <SidebarMenuItem>
                <Collapsible defaultOpen className="group/collapsible">
                  <CollapsibleTrigger render={<SidebarMenuButton tooltip="Rayons" />}>
                    <LayoutGrid />
                    <span>Rayons</span>
                    <ChevronRight className="ml-auto transition-transform group-data-open/collapsible:rotate-90" />
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {storefront.isLoading &&
                        ["a", "b", "c"].map((key) => (
                          <SidebarMenuSubItem key={key}>
                            <SidebarMenuSkeleton />
                          </SidebarMenuSubItem>
                        ))}
                      {categories.map((category) => (
                        <SidebarMenuSubItem key={category.name}>
                          <SidebarMenuSubButton
                            render={<NavLink to={`/?group=${encodeURIComponent(category.name)}`} />}
                            isActive={group === category.name}
                          >
                            <span>{category.name}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </Collapsible>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser context={context} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
