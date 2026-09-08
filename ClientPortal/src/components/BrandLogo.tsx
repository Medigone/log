import { cn } from "@/lib/utils"

const LOGO_URL = "/assets/log/images/logo_mp_new.png"

export function BrandLogo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <img
      src={LOGO_URL}
      alt="Modern Pharma"
      className={cn(compact ? "size-9 object-contain" : "h-9 w-auto object-contain", className)}
    />
  )
}
