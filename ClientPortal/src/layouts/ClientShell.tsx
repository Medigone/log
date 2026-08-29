import { NavLink } from "react-router-dom"
import { ArrowRight, ShoppingCart, Truck } from "lucide-react"
import type { ReactNode } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { useCart } from "@/cart/CartContext"
import { useIsMobile } from "@/hooks/use-mobile"
import { AppSidebar } from "@/layouts/AppSidebar"
import { HeaderSearch } from "@/layouts/HeaderSearch"
import { MobileBottomNav } from "@/layouts/MobileBottomNav"
import { PortalBreadcrumb } from "@/layouts/PortalBreadcrumb"
import { cn } from "@/lib/utils"
import type { PortalContext } from "@/shared/types"

export function inProgressDeliveryLabel(orderIds: string[]) {
  return orderIds.join(", ")
}

function InProgressDeliveryAlert({ orderIds }: { orderIds: string[] }) {
  if (!orderIds.length) return null
  return (
    <div className="flex flex-col gap-2">
      {orderIds.map((orderId) => (
        <Alert key={orderId} variant="warning">
          <Truck />
          <AlertTitle>Livraison en cours</AlertTitle>
          <AlertDescription>{orderId}</AlertDescription>
          <AlertAction className="top-auto bottom-2">
            <Button size="xs" render={<NavLink to={`/orders/${orderId}`} />} nativeButton={false}>
              Voir la commande
              <ArrowRight data-icon="inline-end" />
            </Button>
          </AlertAction>
        </Alert>
      ))}
    </div>
  )
}

export function ClientShell({ context, children }: { context: PortalContext; children: ReactNode }) {
  const cart = useCart()
  const isMobile = useIsMobile()
  const inProgressOrders = context.inProgressOrders ?? []

  return (
    <SidebarProvider>
      <AppSidebar context={context} />
      <SidebarInset className={cn(isMobile && "pb-[calc(4.5rem+env(safe-area-inset-bottom))]")}>
        <header className="flex h-16 shrink-0 items-center justify-between gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex min-w-0 items-center gap-2 px-4">
            {!isMobile && (
              <>
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
              </>
            )}
            <PortalBreadcrumb />
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-end gap-2 px-4">
            <HeaderSearch />
            <Button size="icon" className="relative md:hidden" render={<NavLink to="/cart" />} nativeButton={false} aria-label={cart.count > 0 ? `Panier (${cart.count})` : "Panier"}>
              <ShoppingCart />
              {cart.count > 0 && (
                <Badge variant="secondary" className="absolute -top-1.5 -right-1.5 min-w-4 px-1">
                  {cart.count}
                </Badge>
              )}
            </Button>
            <Button className="hidden md:inline-flex" render={<NavLink to="/cart" />} nativeButton={false}>
              <ShoppingCart data-icon="inline-start" />
              Panier{cart.count > 0 ? ` (${cart.count})` : ""}
            </Button>
          </div>
        </header>
        <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <InProgressDeliveryAlert orderIds={inProgressOrders} />
          {children}
        </div>
      </SidebarInset>
      {isMobile && <MobileBottomNav context={context} />}
    </SidebarProvider>
  )
}
