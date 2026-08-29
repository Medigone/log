import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 rounded-xl border bg-muted/30 p-2", className)}>
      {children}
    </div>
  )
}

interface ToolbarFieldProps {
  label?: ReactNode
  children: ReactNode
  className?: string
}

export function ToolbarField({ children, className }: ToolbarFieldProps) {
  return <div className={cn("min-w-0", className)}>{children}</div>
}

export function ToolbarSpacer() {
  return <div className="ml-auto" />
}
