import { NavLink, useLocation } from "react-router-dom"
import { BrandLogo } from "@/shared/ui/BrandLogo"
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
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { NavAlertCard } from "@/layouts/NavAlertCard"
import { NavSearch } from "@/layouts/NavSearch"
import { NavUser } from "@/layouts/NavUser"
import { groupedNavItems, isNavItemActive } from "@/layouts/navItems"
import { useNavBadges } from "@/layouts/navBadges"
import { cn } from "@/lib/utils"
import type { DistributionUser } from "@/shared/types/distribution"

export function AppSidebar({ user }: { user: DistributionUser }) {
  const { state, isMobile, open } = useSidebar()
  const collapsed = state === "collapsed" && !isMobile
  const toggleLabel = isMobile ? "Ouvrir le menu de navigation" : open ? "Réduire le menu" : "Déplier le menu"
  const { pathname } = useLocation()
  const groups = groupedNavItems(user.role)
  const badges = useNavBadges()
  const homePath = groups[0]?.items[0]?.to || "/today"

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {collapsed ? (
          <SidebarTrigger className="mx-auto" aria-label={toggleLabel} title={toggleLabel} />
        ) : (
          <div className="flex items-center gap-2.5">
            <NavLink to={homePath} className="flex min-w-0 items-center gap-2.5">
              <BrandLogo compact className="size-8" alt="IntraPro" />
              <span className="flex min-w-0 flex-col leading-tight">
                <span className="truncate text-sm font-bold tracking-tight">IntraPro</span>
                <span className="truncate text-[11.5px] text-muted-foreground">Distribution</span>
              </span>
            </NavLink>
            <div className="flex-1" />
            <SidebarTrigger aria-label={toggleLabel} title={toggleLabel} />
          </div>
        )}
        <NavSearch role={user.role} showTrigger={!collapsed} />
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.group}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = isNavItemActive(pathname, item.to)
                  const badge = item.badgeKey ? badges[item.badgeKey] : undefined
                  const Icon = item.icon
                  return (
                    <SidebarMenuItem key={item.to}>
                      <SidebarMenuButton
                        isActive={active}
                        tooltip={badge ? `${item.label} · ${badge.count} en attente` : item.label}
                        render={<NavLink to={item.to} />}
                        className={cn(active && "font-semibold")}
                      >
                        <Icon />
                        <span>{item.label}</span>
                        {badge && !collapsed && (
                          <span
                            className={cn(
                              "num ml-auto flex h-[18px] min-w-5 items-center justify-center rounded-full px-1.5 text-[10.5px] font-medium",
                              badge.alert
                                ? "bg-destructive/10 text-destructive"
                                : "bg-muted text-muted-foreground",
                            )}
                          >
                            {badge.count}
                          </span>
                        )}
                      </SidebarMenuButton>
                      {active && (
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-sidebar-foreground"
                        />
                      )}
                      {badge && collapsed && (
                        <span
                          aria-hidden
                          className={cn(
                            "pointer-events-none absolute top-1 right-1 size-1.5 rounded-full",
                            badge.alert ? "bg-destructive" : "bg-muted-foreground",
                          )}
                        />
                      )}
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter>
        {!collapsed && <NavAlertCard />}
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
