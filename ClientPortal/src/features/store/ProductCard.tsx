import { useState } from "react"
import { ImageOff, Minus, Plus, ShoppingCart } from "lucide-react"
import { NavLink } from "react-router-dom"
import { toast } from "sonner"
import { useCart } from "@/cart/CartContext"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group"
import { cn } from "@/lib/utils"
import { usePromotionEvents } from "@/shared/api"
import { formatMoney } from "@/shared/format"
import type { CatalogItem } from "@/shared/types"

export function plainText(value?: string | null) {
  return (value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

export function QuantityInput({
  value,
  onChange,
  name,
  compact = false,
}: {
  value: number
  onChange: (quantity: number) => void
  name: string
  compact?: boolean
}) {
  return (
    <InputGroup className={cn("w-full bg-background", compact ? "h-7" : undefined)}>
      <InputGroupAddon>
        <InputGroupButton size={compact ? "icon-xs" : "icon-sm"} aria-label={`Diminuer ${name}`} onClick={() => onChange(Math.max(1, value - 1))}>
          <Minus />
        </InputGroupButton>
      </InputGroupAddon>
      <InputGroupInput
        aria-label={`Quantité ${name}`}
        type="number"
        min="1"
        value={value}
        onChange={(event) => onChange(Math.max(1, Number(event.target.value) || 1))}
        className="text-center tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size={compact ? "icon-xs" : "icon-sm"} aria-label={`Augmenter ${name}`} onClick={() => onChange(value + 1)}>
          <Plus />
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}

export function ProductPrice({ item, compact = false }: { item: CatalogItem; compact?: boolean }) {
  const current = item.unitPriceTtc
  if (item.showPrice === false || current == null) {
    return (
      <div className="flex min-h-[1lh] flex-col gap-0.5">
        <p className={cn("text-muted-foreground", compact ? "text-xs" : "text-sm")}>Prix sur demande</p>
        {item.offerCondition && <p className="text-xs text-muted-foreground">{item.offerCondition}</p>}
      </div>
    )
  }
  const catalog = item.catalogPriceTtc
  const onSale = catalog != null && catalog - current > 0.009
  return (
    <div className="flex min-h-[1lh] flex-col gap-0.5">
      <p className={cn("flex flex-wrap items-center gap-1.5 font-normal", compact ? "text-xs" : "text-sm")}>
        {onSale && (
          <span className="text-xs font-normal text-muted-foreground line-through">
            {formatMoney(catalog, item.currency)}
          </span>
        )}
        <span>{formatMoney(current, item.currency)}</span>
        {item.offerLabel && (
          <Badge variant="destructive" className="px-1.5 py-0 text-[0.65rem]">
            {item.offerLabel}
          </Badge>
        )}
      </p>
      {item.offerCondition && <p className="text-xs text-muted-foreground">{item.offerCondition}</p>}
    </div>
  )
}

export function InCartBadge({ quantity, compact = false }: { quantity: number; compact?: boolean }) {
  if (quantity <= 0) return null
  return (
    <Badge
      variant="default"
      className={cn("absolute z-10", compact ? "top-1.5 right-1.5" : "top-2 right-2")}
      aria-label={`Dans le panier · ${quantity}`}
    >
      <ShoppingCart data-icon="inline-start" />
      {quantity}
    </Badge>
  )
}

export function ProductCard({ item, size = "default" }: { item: CatalogItem; size?: "default" | "sm" }) {
  const cart = useCart()
  const events = usePromotionEvents()
  const [quantity, setQuantity] = useState(1)
  const compact = size === "sm"
  const cartQuantity = cart.lines.find((line) => line.itemCode === item.itemCode)?.quantity ?? 0

  const add = () => {
    cart.add(item, quantity)
    void events.track({
      eventType: "add_to_cart",
      campaign: item.campaign,
      placement: item.placement,
      itemCode: item.itemCode,
    })
    toast.success(quantity > 1 ? `${quantity} × ${item.itemName} ajoutés au panier` : `${item.itemName} ajouté au panier`)
  }

  return (
    <Card
      size="sm"
      className="h-full gap-2 overflow-hidden rounded-2xl p-3 shadow-none has-data-[slot=card-footer]:pb-3"
    >
      <NavLink
        to={`/products/${encodeURIComponent(item.itemCode)}`}
        className="relative block aspect-square w-full shrink-0 overflow-hidden rounded-2xl bg-muted"
        onClick={() =>
          void events.track({
            eventType: "select_promotion",
            campaign: item.campaign,
            placement: item.placement,
            itemCode: item.itemCode,
          })
        }
      >
        {item.image ? (
          <img
            src={item.image}
            alt={item.itemName}
            className={cn("absolute inset-0 size-full object-contain", compact ? "p-2" : "p-4")}
          />
        ) : (
          <ImageOff
            className={cn(
              "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-muted-foreground/50",
              compact ? "size-5" : "size-6",
            )}
          />
        )}
        <InCartBadge quantity={cartQuantity} compact={compact} />
      </NavLink>
      <CardHeader className="gap-1 p-0">
        <p className="truncate text-xs text-muted-foreground">{item.itemGroup}</p>
        <CardTitle
          className={cn(
            "line-clamp-2 min-h-[2lh] leading-snug font-semibold",
            compact ? "text-sm group-data-[size=sm]/card:text-sm" : "text-base group-data-[size=sm]/card:text-base",
          )}
        >
          <NavLink to={`/products/${encodeURIComponent(item.itemCode)}`}>{item.itemName}</NavLink>
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col p-0">
        <ProductPrice item={item} compact={compact} />
      </CardContent>
      <CardFooter className="mt-auto flex-col items-stretch gap-2 border-0 bg-transparent p-0">
        <QuantityInput value={quantity} onChange={setQuantity} name={item.itemName} compact={compact} />
        <Button size="sm" className="w-full rounded-full" onClick={add}>
          <ShoppingCart data-icon="inline-start" />
          {cartQuantity > 0 ? "Ajouter encore" : "Ajouter"}
        </Button>
      </CardFooter>
    </Card>
  )
}
