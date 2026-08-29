import { ImageOff } from "lucide-react"
import { ItemMedia } from "@/components/ui/item"

export function ItemImage({ src, alt }: { src?: string | null; alt: string }) {
  return (
    <ItemMedia variant="image" className="size-16 rounded-md bg-muted sm:size-20 [&_img]:object-contain">
      {src ? <img src={src} alt={alt} /> : <ImageOff className="size-5 text-muted-foreground/50" aria-hidden />}
    </ItemMedia>
  )
}
