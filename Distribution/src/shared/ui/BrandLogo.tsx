import { cn } from "@/lib/utils";

const LOGO_URL = "/assets/log/images/logo_mp_new.png";

interface BrandLogoProps {
  className?: string;
  alt?: string;
  compact?: boolean;
}

export function BrandLogo({ className, alt = "IntraPro", compact = false }: BrandLogoProps) {
  return (
    <img
      src={LOGO_URL}
      alt={alt}
      className={cn(compact ? "h-8 w-8 object-contain" : "h-8 w-auto object-contain", className)}
    />
  );
}
