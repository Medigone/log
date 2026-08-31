import { useEffect, useState } from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts.slice(0, 2).map((part) => part[0]).join("") || "?").toUpperCase()
}

export function ProductImage({
  src,
  alt,
  className,
  compact = false,
}: {
  src?: string | null
  alt: string
  className?: string
  compact?: boolean
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">(src ? "loading" : "error")

  useEffect(() => {
    setStatus(src ? "loading" : "error")
  }, [src])

  if (!src || status === "error") {
    return (
      <div className={cn("grid place-items-center bg-muted", className)} aria-hidden>
        <span className="text-sm font-medium tracking-wide text-muted-foreground">{initials(alt)}</span>
      </div>
    )
  }

  return (
    <div className={cn("relative bg-muted", className)}>
      {status === "loading" && <Skeleton className="absolute inset-0 rounded-none" />}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        className={cn("absolute inset-0 size-full object-contain", compact ? "p-2" : "p-4")}
        onLoad={() => setStatus("ready")}
        onError={() => setStatus("error")}
      />
    </div>
  )
}
