import { cn } from "@/lib/utils";

const LOGO_URL = "/assets/log/images/intrapro-logo.png";
const MARK_URL = "/assets/log/images/intrapro-mark.png";

interface BrandLogoProps {
  className?: string;
  alt?: string;
  compact?: boolean;
}

export function BrandLogo({ className, alt = "IntraPro", compact = false }: BrandLogoProps) {
  return (
    <img
      src={compact ? MARK_URL : LOGO_URL}
      alt={alt}
      className={cn(compact ? "h-8 w-8 object-contain" : "h-8 w-auto", className)}
    />
  );
}
