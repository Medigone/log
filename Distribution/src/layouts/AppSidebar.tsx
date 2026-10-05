import { useMemo, useState } from "react"
import { ChevronRight } from "lucide-react"
import { NavLink, useLocation } from "react-router-dom"
import { BrandLogo } from "@/shared/ui/BrandLogo"
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
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { NavAlertCard } from "@/layouts/NavAlertCard"
import { NavSearch } from "@/layouts/NavSearch"
import { NavUser } from "@/layouts/NavUser"
import { groupedNavItems, isNavItemActive, userCapabilities, type NavGroup } from "@/layouts/navItems"
import { useInventoryNavBadge, useNavBadges, useOrderNavBadge, useReceiptNavBadge } from "@/layouts/navBadges"
import { cn } from "@/lib/utils"
import type { DistributionUser } from "@/shared/types/distribution"

const CLOSED_GROUPS_KEY = "distribution.sidebar.closedGroups"

function readClosedGroups(): NavGroup[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(CLOSED_GROUPS_KEY) || "[]")
    return Array.isArray(parsed) ? (parsed as NavGroup[]) : []
  } catch {
    return []
  }
}

/** Sections repliées, mémorisées par navigateur. */
function useClosedGroups() {
  const [closed, setClosed] = useState<NavGroup[]>(readClosedGroups)
  const setGroupOpen = (group: NavGroup, open: boolean) => {
    setClosed((current) => {
      const next = open ? current.filter((entry) => entry !== group) : [...current.filter((entry) => entry !== group), group]
      try {
        localStorage.setItem(CLOSED_GROUPS_KEY, JSON.stringify(next))
      } catch {
        // Stockage indisponible : l'état reste valable pour la session.
      }
      return next
    })
  }
  return { closed, setGroupOpen }
}

export function AppSidebar({ user }: { user: DistributionUser }) {
  const { state, isMobile, open } = useSidebar()
  const collapsed = state === "collapsed" && !isMobile
  const toggleLabel = isMobile ? "Ouvrir le menu de navigation" : open ? "Réduire le menu" : "Déplier le menu"
  const { pathname } = useLocation()
  const capabilities = useMemo(() => userCapabilities(user), [user])
  const groups = groupedNavItems(user.role, capabilities)
  const dashboardBadges = useNavBadges()
  const receiptBadges = useReceiptNavBadge(user.role)
  const orderBadges = useOrderNavBadge(user.role)
  const inventoryBadges = useInventoryNavBadge(user.role)
  const { closed, setGroupOpen } = useClosedGroups()
  const badges = { ...dashboardBadges, ...receiptBadges, ...orderBadges, ...inventoryBadges }
  // Le logo ramène au tableau de bord quand il est accessible, sinon à la première page du menu.
  const visiblePaths = groups.flatMap((group) => group.items.map((item) => item.to))
  const groupBadge = (items: typeof groups[number]["items"]) => {
    const counts = items.map((item) => (item.badgeKey ? badges[item.badgeKey] : undefined)).filter((badge) => badge != null)
    const count = counts.reduce((sum, badge) => sum + badge.count, 0)
    return count ? { count, alert: counts.some((badge) => badge.alert) } : null
  }
  const homePath = visiblePaths.includes("/today") ? "/today" : visiblePaths[0] || "/today"

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
        <NavSearch role={user.role} capabilities={capabilities} showTrigger={!collapsed} />
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <Collapsible
            key={group.group}
            // En mode icônes, les libellés de section sont masqués : tout reste déplié.
            open={collapsed || !closed.includes(group.group)}
            onOpenChange={(open) => setGroupOpen(group.group, open)}
            render={<SidebarGroup />}
          >
            <SidebarGroupLabel
              render={<CollapsibleTrigger />}
              className="group/label h-9 w-full cursor-pointer gap-2 text-[13px] font-semibold text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <group.icon className="text-sidebar-foreground/60" />
              <span>{group.label}</span>
              {/* Section repliée : ses compteurs restent visibles, cumulés. */}
              {closed.includes(group.group) && !collapsed && groupBadge(group.items) ? (
                <span
                  className={cn(
                    "num flex h-[18px] min-w-5 items-center justify-center rounded-full px-1.5 text-[10.5px] font-medium",
                    groupBadge(group.items)?.alert ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
                  )}
                >
                  {groupBadge(group.items)?.count}
                </span>
              ) : null}
              <ChevronRight className="ml-auto transition-transform duration-200 group-data-[panel-open]/label:rotate-90" />
            </SidebarGroupLabel>
            <CollapsibleContent render={<SidebarGroupContent />}>
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
            </CollapsibleContent>
          </Collapsible>
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
