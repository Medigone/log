import type { ReactNode } from "react"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppSidebar } from "@/layouts/AppSidebar"
import { ConsoleBreadcrumb, BreadcrumbLabelProvider } from "@/layouts/ConsoleBreadcrumb"
import type { DistributionUser } from "@/shared/types/distribution"

interface DesktopShellProps {
  children: ReactNode
  user: DistributionUser
}

function ShellHeader() {
  const { open, isMobile } = useSidebar()
  const label = isMobile ? "Ouvrir le menu de navigation" : open ? "Réduire le menu" : "Déplier le menu"

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex min-w-0 items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" aria-label={label} title={label} />
        <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
        <ConsoleBreadcrumb />
      </div>
    </header>
  )
}

export function DistributionShell({ children, user }: DesktopShellProps) {
  return (
    <TooltipProvider>
      <BreadcrumbLabelProvider>
        <SidebarProvider>
          <AppSidebar user={user} />
          <SidebarInset>
            <ShellHeader />
            <div className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
              {children}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </BreadcrumbLabelProvider>
    </TooltipProvider>
  )
}

export { DistributionShell as DesktopShell }
