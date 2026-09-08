import { cn } from "@/lib/utils"

const LOGO_URL = "/assets/log/images/logo_mp_new.png"

export function BrandLogo({
  compact = false,
  className,
  alt = "Modern Pharma",
}: {
  compact?: boolean
  className?: string
  alt?: string
}) {
  return (
    <img
      src={LOGO_URL}
      alt={alt}
      className={cn(compact ? "size-9 object-contain" : "h-9 w-auto object-contain", className)}
    />
  )
}
