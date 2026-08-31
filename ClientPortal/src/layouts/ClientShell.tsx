import { NavLink } from "react-router-dom"
import { ArrowRight, Truck } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Alert, AlertAction, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar"
import { CartButton } from "@/layouts/CartButton"
import { AppSidebar } from "@/layouts/AppSidebar"
import { HeaderSearch } from "@/layouts/HeaderSearch"
import { PortalBreadcrumb } from "@/layouts/PortalBreadcrumb"
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
  const inProgressOrders = context.inProgressOrders ?? []

  return (
    <SidebarProvider>
      <AppSidebar context={context} />
      <SidebarInset className="min-w-0 overflow-x-hidden">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
          <div className="flex min-w-0 items-center gap-2 px-3 sm:px-4">
            <SidebarTrigger className="-ml-1" />
            <Separator orientation="vertical" className="mr-1 hidden data-[orientation=vertical]:h-4 md:block" />
            <div className="hidden min-w-0 md:block">
              <PortalBreadcrumb />
            </div>
          </div>
          <div className="flex min-w-0 flex-1 items-center justify-center px-2">
            <HeaderSearch />
          </div>
          <div className="flex items-center gap-2 px-3 sm:px-4">
            <CartButton />
          </div>
        </header>
        <div className="mx-auto flex w-full min-w-0 max-w-[1680px] flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
          <InProgressDeliveryAlert orderIds={inProgressOrders} />
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}
