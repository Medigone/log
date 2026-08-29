import { cn } from "@/lib/utils"

export function BrandLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <img
      src={compact ? "/assets/log/images/intrapro-mark.png" : "/assets/log/images/intrapro-logo.png"}
      alt="IntraPro"
      className={cn(compact ? "size-9 object-contain" : "h-9 w-auto object-contain", className)}
    />
  )
}
