import { NavLink, useLocation } from "react-router-dom"
import { BrandLogo } from "@/components/BrandLogo"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"
import { offerCount } from "@/features/store/catalogQuery"
import { NavUser } from "@/layouts/NavUser"
import { isStoreNavActive, storeNav } from "@/layouts/storeNav"
import { useStorefront } from "@/shared/api"
import type { PortalContext } from "@/shared/types"

export function AppSidebar({ context }: { context: PortalContext }) {
  const location = useLocation()
  const storefront = useStorefront()
  const offers = offerCount(storefront.data?.message)

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
          <SidebarGroupContent>
            <SidebarMenu>
              {storeNav.map((item) => {
                const Icon = item.icon
                const active = isStoreNavActive(item, location.pathname, location.search)
                return (
                  <SidebarMenuItem key={item.label}>
                    <SidebarMenuButton render={<NavLink to={item.to} />} isActive={active} tooltip={item.label}>
                      <Icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                    {item.match === "offres" && offers > 0 && (
                      <SidebarMenuBadge className="bg-warning text-foreground">{offers}</SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                )
              })}
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
