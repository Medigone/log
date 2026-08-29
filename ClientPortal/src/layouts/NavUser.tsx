import { useFrappeAuth } from "frappe-react-sdk"
import { useNavigate } from "react-router-dom"
import { Banknote, ChevronsUpDown, ClipboardList, LogOut, PackageCheck, UserRound } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
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
import { cn } from "@/lib/utils"
import type { PortalContext } from "@/shared/types"

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts.slice(0, 2).map((part) => part[0]).join("") || "?").toUpperCase()
}

export function CustomerAvatar({
  name,
  image,
  className,
}: {
  name: string
  image?: string | null
  className?: string
}) {
  return (
    <Avatar className={cn("rounded-lg", className)}>
      {image ? <AvatarImage src={image} alt={name} className="rounded-lg" /> : null}
      <AvatarFallback className="rounded-lg bg-black text-white">{initials(name)}</AvatarFallback>
    </Avatar>
  )
}

export function NavUser({ context, variant = "sidebar" }: { context: PortalContext; variant?: "sidebar" | "bar" }) {
  const { isMobile, setOpenMobile } = useSidebar()
  const { logout } = useFrappeAuth()
  const navigate = useNavigate()
  const displayName = context.customer.customerName || context.user.fullName
  const contactName = context.user.fullName || context.user.email
  const inProgressCount = context.inProgressOrders?.length ?? 0
  const compact = variant === "bar"

  const go = (to: string) => {
    if (isMobile) setOpenMobile(false)
    navigate(to)
  }

  const handleLogout = async () => {
    await logout()
    window.location.reload()
  }

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          compact ? (
            <Button variant="ghost" size="icon-lg" className="size-11" aria-label={displayName} />
          ) : (
            <SidebarMenuButton
              size="lg"
              className="data-open:bg-sidebar-accent data-open:text-sidebar-accent-foreground"
            />
          )
        }
      >
        <CustomerAvatar name={displayName} image={context.customer.image} />
        {!compact && (
          <>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{displayName}</span>
              <span className="truncate text-xs">{contactName}</span>
            </div>
            <ChevronsUpDown className="ml-auto" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        className="min-w-56 rounded-lg"
        side={compact ? "top" : isMobile ? "bottom" : "right"}
        align="end"
        sideOffset={4}
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="p-0 font-normal">
            <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
              <CustomerAvatar name={displayName} image={context.customer.image} />
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">{displayName}</span>
                <span className="truncate text-xs">{contactName}</span>
              </div>
            </div>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => go("/orders")}>
            <ClipboardList />
            Commandes
            {inProgressCount > 0 && <Badge variant="warning" className="ml-auto">{inProgressCount}</Badge>}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => go("/deliveries")}>
            <PackageCheck />
            Bons de livraison
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => go("/payments")}>
            <Banknote />
            Paiements
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => go("/account")}>
            <UserRound />
            Mon compte
          </DropdownMenuItem>
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
  )

  if (compact) return menu

  return (
    <SidebarMenu>
      <SidebarMenuItem>{menu}</SidebarMenuItem>
    </SidebarMenu>
  )
}
