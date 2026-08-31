import { useState } from "react"
import { Check, ShoppingCart } from "lucide-react"
import { NavLink, useLocation } from "react-router-dom"
import { productDetailsTo } from "@/layouts/storeNav"
import { toast } from "sonner"
import { useCart } from "@/cart/CartContext"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { ProductImage } from "@/features/store/ProductImage"
import { QuantitySelector } from "@/features/store/QuantitySelector"
import { cn } from "@/lib/utils"
import { usePromotionEvents } from "@/shared/api"
import { formatMoney } from "@/shared/format"
import type { CatalogItem } from "@/shared/types"

export function plainText(value?: string | null) {
  return (value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
}

export function QuantityInput(props: {
  value: number
  onChange: (quantity: number) => void
  name: string
  uom?: string
  compact?: boolean
}) {
  return <QuantitySelector {...props} />
}

export function ProductPrice({ item, compact = false }: { item: CatalogItem; compact?: boolean }) {
  const current = item.unitPriceTtc
  if (item.showPrice === false) {
    return (
      <div className="flex min-h-[1lh] flex-col gap-0.5">
        <p className={cn("text-muted-foreground", compact ? "text-xs" : "text-sm")}>Sur devis</p>
        {item.offerCondition && <p className="text-xs text-muted-foreground">{item.offerCondition}</p>}
      </div>
    )
  }
  if (current == null) {
    return (
      <div className="flex min-h-[1lh] flex-col gap-0.5">
        <p className={cn("text-muted-foreground", compact ? "text-xs" : "text-sm")}>Prix non disponible</p>
        {item.offerCondition && <p className="text-xs text-muted-foreground">{item.offerCondition}</p>}
      </div>
    )
  }
  const catalog = item.catalogPriceTtc
  const onSale = catalog != null && catalog - current > 0.009
  return (
    <div className="flex min-h-[1lh] flex-col gap-0.5">
      <p className={cn("flex flex-wrap items-baseline gap-1.5 font-semibold", compact ? "text-sm" : "text-base")}>
        {onSale && (
          <span className="text-xs font-normal text-muted-foreground line-through">
            {formatMoney(catalog, item.currency)}
          </span>
        )}
        <span>
          {formatMoney(current, item.currency)}{" "}
          <span className="text-xs font-normal text-muted-foreground">TTC</span>
        </span>
        {item.offerLabel && (
          <Badge variant="warning" className="px-1.5 py-0 text-[0.65rem]">
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

export function ProductCard({ item }: { item: CatalogItem; size?: "default" | "sm" }) {
  const cart = useCart()
  const location = useLocation()
  const detailsTo = productDetailsTo(item.itemCode, location.search)
  const events = usePromotionEvents()
  const [quantity, setQuantity] = useState(Math.max(1, Math.round(item.lastQuantity || 1)))
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)
  const cartQuantity = cart.lines.find((line) => line.itemCode === item.itemCode)?.quantity ?? 0
  const details = [`Réf. ${item.itemCode}`, item.uom].filter(Boolean).join(" · ")

  const add = async () => {
    if (adding) return
    setAdding(true)
    try {
      cart.add(item, quantity)
      void events.track({
        eventType: "add_to_cart",
        campaign: item.campaign,
        placement: item.placement,
        itemCode: item.itemCode,
      })
      setAdded(true)
      window.setTimeout(() => {
        setAdded(false)
        setAdding(false)
      }, 1400)
    } catch {
      toast.error("Impossible d’ajouter cet article au panier.")
      setAdding(false)
    }
  }

  return (
    <Card size="sm" className="h-full min-w-0 gap-1.5 overflow-hidden rounded-xl p-2 shadow-none ring-foreground/10 has-data-[slot=card-footer]:pb-2">
      <NavLink
        to={detailsTo}
        className="relative block aspect-[4/3] w-full shrink-0 overflow-hidden rounded-lg bg-muted"
        onClick={() =>
          void events.track({
            eventType: "select_promotion",
            campaign: item.campaign,
            placement: item.placement,
            itemCode: item.itemCode,
          })
        }
      >
        <ProductImage src={item.image} alt={item.itemName} compact className="absolute inset-0 size-full" />
        <InCartBadge quantity={cartQuantity} compact />
      </NavLink>
      <CardHeader className="gap-0.5 p-0">
        <p className="truncate text-[0.65rem] text-muted-foreground">{item.itemGroup}</p>
        <CardTitle className="line-clamp-2 text-sm leading-snug font-semibold group-data-[size=sm]/card:text-sm">
          <NavLink to={detailsTo}>{item.itemName}</NavLink>
        </CardTitle>
        <p className="truncate text-[0.65rem] text-muted-foreground">{details}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col p-0">
        <ProductPrice item={item} compact />
      </CardContent>
      <CardFooter className="mt-auto flex-col items-stretch gap-1.5 border-0 bg-transparent p-0">
        <QuantitySelector value={quantity} onChange={setQuantity} name={item.itemName} uom={item.uom} compact />
        <Button size="sm" className="h-7 w-full text-xs" disabled={adding} onClick={() => void add()}>
          {adding ? <Spinner data-icon="inline-start" /> : added ? <Check data-icon="inline-start" /> : <ShoppingCart data-icon="inline-start" />}
          {adding ? "Ajout…" : added ? "Ajouté" : "Ajouter au panier"}
        </Button>
      </CardFooter>
    </Card>
  )
}
