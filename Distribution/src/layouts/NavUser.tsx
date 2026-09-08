import { useFrappeAuth } from "frappe-react-sdk"
import { ChevronsUpDown, LogOut } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar"
import { roleLabels } from "@/layouts/navItems"
import { cn } from "@/lib/utils"
import { goToLanding } from "@/shared/session"
import type { DistributionUser } from "@/shared/types/distribution"

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts.slice(0, 2).map((part) => part[0]).join("") || "?").toUpperCase()
}

function UserAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <Avatar className={cn("rounded-lg", className)}>
      <AvatarFallback className="rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  )
}

export function NavUser({ user }: { user: DistributionUser }) {
  const { isMobile } = useSidebar()
  const { logout } = useFrappeAuth()

  const handleLogout = async () => {
    await logout()
    goToLanding()
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton
                size="lg"
                className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
              />
            }
          >
            <UserAvatar name={user.fullName} />
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.fullName}</span>
              <span className="truncate text-xs">{roleLabels[user.role]}</span>
            </div>
            <ChevronsUpDown className="ml-auto" />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <UserAvatar name={user.fullName} />
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.fullName}</span>
                    <span className="truncate text-xs">{user.email || roleLabels[user.role]}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={() => void handleLogout()}>
                <LogOut />
                Déconnexion
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
