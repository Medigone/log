import { useState } from "react"
import { NavLink } from "react-router-dom"
import { ArrowRight, ShoppingCart } from "lucide-react"
import { toast } from "sonner"
import { useCart } from "@/cart/CartContext"
import { Button } from "@/components/ui/button"
import { ProductImage } from "@/features/store/ProductImage"
import { QuantitySelector } from "@/features/store/QuantitySelector"
import { usePromotionEvents } from "@/shared/api"
import type { CatalogItem } from "@/shared/types"

export function ReorderSection({ items }: { items: CatalogItem[] }) {
  if (items.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">Commander à nouveau</h3>
        <Button variant="ghost" size="sm" render={<NavLink to="/orders" />} nativeButton={false}>
          Voir mes commandes
          <ArrowRight data-icon="inline-end" />
        </Button>
      </div>
      <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((item) => (
          <ReorderCard key={item.itemCode} item={item} />
        ))}
      </div>
    </section>
  )
}

function ReorderCard({ item }: { item: CatalogItem }) {
  const cart = useCart()
  const events = usePromotionEvents()
  const [quantity, setQuantity] = useState(Math.max(1, Math.round(item.lastQuantity || 1)))
  const [adding, setAdding] = useState(false)

  const add = () => {
    if (adding) return
    setAdding(true)
    cart.add(item, quantity)
    void events.track({
      eventType: "add_to_cart",
      campaign: item.campaign,
      placement: item.placement || "reorder",
      itemCode: item.itemCode,
    })
    toast.success(`${item.itemName} ajouté au panier`)
    window.setTimeout(() => setAdding(false), 400)
  }

  return (
    <div className="flex min-w-72 items-center gap-3 rounded-xl border bg-card p-2.5 ring-1 ring-foreground/10">
      <ProductImage src={item.image} alt={item.itemName} compact className="size-14 shrink-0 overflow-hidden rounded-lg" />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{item.itemName}</p>
          <p className="truncate text-xs text-muted-foreground">Réf. {item.itemCode}</p>
        </div>
        <div className="flex items-center gap-2">
          <QuantitySelector value={quantity} onChange={setQuantity} name={item.itemName} uom={item.uom} compact />
          <Button size="icon-sm" aria-label={`Ajouter ${item.itemName} au panier`} disabled={adding} onClick={add}>
            <ShoppingCart />
          </Button>
        </div>
      </div>
    </div>
  )
}
