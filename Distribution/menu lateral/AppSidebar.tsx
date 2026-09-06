import { useState } from "react"
import { NavLink, useLocation } from "react-router-dom"
import { Search } from "lucide-react"
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
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import { NavUser } from "@/layouts/NavUser"
import { NavAlertCard } from "@/layouts/NavAlertCard"
import { groupedNavItems } from "@/layouts/navItems"
import { useNavBadges } from "@/layouts/navBadges"
import { cn } from "@/lib/utils"
import type { DistributionRole } from "@/shared/types/distribution"

export function AppSidebar({ role, homePath = "/today" }: { role: DistributionRole; homePath?: string }) {
  const { state } = useSidebar()
  const collapsed = state === "collapsed"
  const location = useLocation()
  const groups = groupedNavItems(role)
  const badges = useNavBadges()
  const [searchOpen, setSearchOpen] = useState(false)

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        {collapsed ? (
          // en rail replié, la bascule remplace le bloc de marque
          <SidebarTrigger className="mx-auto" />
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
            <SidebarTrigger />
          </div>
        )}

        {!collapsed && (
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={searchOpen}
            className="mt-2 flex h-[30px] w-full items-center gap-2 rounded-lg border border-hairline bg-background px-2.5 text-[12.5px] text-muted-foreground hover:border-input hover:bg-card"
          >
            <Search className="size-3.5" />
            <span className="truncate">Rechercher</span>
            <div className="flex-1" />
            <kbd className="num rounded border border-hairline bg-card px-1 text-[10.5px]">⌘K</kbd>
          </button>
        )}
      </SidebarHeader>

      <SidebarContent>
        {groups.map((group) => (
          <SidebarGroup key={group.group}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = location.pathname.startsWith(item.to)
                  const badge = item.badgeKey ? badges[item.badgeKey] : undefined
                  const Icon = item.icon
                  return (
                    <SidebarMenuItem key={item.to} className="relative">
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

                      {/* barre verticale d’état actif */}
                      {active && (
                        <span
                          aria-hidden
                          className="pointer-events-none absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-sidebar-foreground"
                        />
                      )}
                      {/* rail replié : le compteur devient un point */}
                      {badge && collapsed && (
                        <span
                          aria-hidden
                          className={cn(
                            "pointer-events-none absolute right-1 top-1 size-1.5 rounded-full",
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
        <NavUser role={role} />
      </SidebarFooter>
    </Sidebar>
  )
}
