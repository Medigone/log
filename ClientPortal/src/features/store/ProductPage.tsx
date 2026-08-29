import { useState } from "react"
import { ImageOff, ShoppingCart } from "lucide-react"
import { useParams } from "react-router-dom"
import { toast } from "sonner"
import { useCart } from "@/cart/CartContext"
import { DetailBackButton } from "@/components/DetailBackButton"
import { ErrorState } from "@/components/LoadState"
import { PageTitle } from "@/components/PageTitle"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { InCartBadge, ProductPrice, QuantityInput, plainText } from "@/features/store/ProductCard"
import { useProduct, usePromotionEvents } from "@/shared/api"

export function ProductPage() {
  const { itemCode } = useParams()
  const decoded = itemCode ? decodeURIComponent(itemCode) : ""
  const { data, isLoading, error } = useProduct(decoded)
  const item = data?.message
  const cart = useCart()
  const events = usePromotionEvents()
  const [quantity, setQuantity] = useState(1)

  if (isLoading) return <Skeleton className="h-96 rounded-xl" />
  if (error || !item) return <ErrorState error={error || new Error("Article introuvable.")} />

  const cartQuantity = cart.lines.find((line) => line.itemCode === item.itemCode)?.quantity ?? 0

  const add = () => {
    cart.add(item, quantity)
    void events.track({
      eventType: "add_to_cart",
      campaign: item.campaign,
      placement: item.placement || "product",
      itemCode: item.itemCode,
    })
    toast.success(quantity > 1 ? `${quantity} × ${item.itemName} ajoutés au panier` : `${item.itemName} ajouté au panier`)
  }

  return (
    <>
      <DetailBackButton to="/" label="Retour à la boutique" />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]">
        <div className="relative grid aspect-square place-items-center overflow-hidden rounded-xl bg-muted/60">
          {item.image ? (
            <img src={item.image} alt={item.itemName} className="h-full w-full object-contain p-8" />
          ) : (
            <ImageOff className="text-muted-foreground/50" />
          )}
          <InCartBadge quantity={cartQuantity} />
        </div>
        <div className="flex flex-col gap-5">
          <PageTitle title={item.itemName} description={item.itemGroup} />
          <p className="text-sm text-muted-foreground">{plainText(item.description) || item.itemCode}</p>
          <p className="text-sm">Unité : {item.uom}</p>
          <ProductPrice item={item} />
          <QuantityInput value={quantity} onChange={setQuantity} name={item.itemName} />
          <Button onClick={add}>
            <ShoppingCart data-icon="inline-start" />
            {cartQuantity > 0 ? "Ajouter encore" : "Ajouter au panier"}
          </Button>
        </div>
      </div>
    </>
  )
}
