import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils";

export function ItemThumb({ image, className }: { image?: string | null; className?: string }) {
  return image ? (
    <img src={image} alt="" className={cn("size-9 shrink-0 rounded-md border object-cover", className)} loading="lazy" />
  ) : (
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-md border bg-muted text-muted-foreground", className)}>
      <ImageOff className="size-4" />
    </span>
  );
}
