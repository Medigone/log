import type { ReactNode } from "react"
import { LayoutDashboard } from "lucide-react"
import { useLocation } from "react-router-dom"
import { buttonVariants } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"
import { AppSidebar } from "@/layouts/AppSidebar"
import { ConsoleBreadcrumb, BreadcrumbLabelProvider } from "@/layouts/ConsoleBreadcrumb"
import { cn } from "@/lib/utils"
import { deskRoot } from "@/shared/frappeCompat"
import type { DistributionUser } from "@/shared/types/distribution"

interface DesktopShellProps {
  children: ReactNode
  user: DistributionUser
}

function ShellHeader({ user }: { user: DistributionUser }) {
  const { isMobile } = useSidebar()

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex min-w-0 flex-1 items-center gap-2 px-4">
        {isMobile && (
          <>
            <SidebarTrigger className="-ml-1" aria-label="Ouvrir le menu de navigation" title="Ouvrir le menu de navigation" />
            <Separator orientation="vertical" className="mr-2 data-[orientation=vertical]:h-4" />
          </>
        )}
        <ConsoleBreadcrumb />
      </div>
      {user.role !== "livreur" && (
        <div className="shrink-0 pr-4">
          <a href={deskRoot()} className={buttonVariants({ variant: "outline", size: "sm" })}>
            <LayoutDashboard data-icon="inline-start" />
            Bureau
          </a>
        </div>
      )}
    </header>
  )
}

export function DistributionShell({ children, user }: DesktopShellProps) {
  const { pathname } = useLocation()
  const fullWidth = pathname === "/planning"

  return (
    <TooltipProvider>
      <BreadcrumbLabelProvider>
        <SidebarProvider>
          <AppSidebar user={user} />
          <SidebarInset>
            <ShellHeader user={user} />
            <div
              className={cn(
                "mx-auto flex w-full flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8",
                !fullWidth && "max-w-[1400px]",
              )}
            >
              {children}
            </div>
          </SidebarInset>
        </SidebarProvider>
      </BreadcrumbLabelProvider>
    </TooltipProvider>
  )
}

export { DistributionShell as DesktopShell }
