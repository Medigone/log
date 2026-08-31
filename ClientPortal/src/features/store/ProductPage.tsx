import { useState } from "react"
import { Check, ShoppingCart } from "lucide-react"
import { useParams } from "react-router-dom"
import { toast } from "sonner"
import { useCart } from "@/cart/CartContext"
import { DetailBackButton } from "@/components/DetailBackButton"
import { ErrorState } from "@/components/LoadState"
import { PageTitle } from "@/components/PageTitle"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { InCartBadge, ProductPrice, plainText } from "@/features/store/ProductCard"
import { ProductImage } from "@/features/store/ProductImage"
import { QuantitySelector } from "@/features/store/QuantitySelector"
import { useProduct, usePromotionEvents } from "@/shared/api"

export function ProductPage() {
  const { itemCode } = useParams()
  const decoded = itemCode ? decodeURIComponent(itemCode) : ""
  const { data, isLoading, error } = useProduct(decoded)
  const item = data?.message
  const cart = useCart()
  const events = usePromotionEvents()
  const [quantity, setQuantity] = useState(1)
  const [adding, setAdding] = useState(false)
  const [added, setAdded] = useState(false)

  if (isLoading) return <Skeleton className="h-96 rounded-xl" />
  if (error || !item) return <ErrorState error={error || new Error("Article introuvable.")} />

  const cartQuantity = cart.lines.find((line) => line.itemCode === item.itemCode)?.quantity ?? 0

  const add = () => {
    if (adding) return
    setAdding(true)
    cart.add(item, quantity)
    void events.track({
      eventType: "add_to_cart",
      campaign: item.campaign,
      placement: item.placement || "product",
      itemCode: item.itemCode,
    })
    toast.success(quantity > 1 ? `${quantity} × ${item.itemName} ajoutés au panier` : `${item.itemName} ajouté au panier`)
    setAdded(true)
    window.setTimeout(() => {
      setAdded(false)
      setAdding(false)
    }, 1200)
  }

  return (
    <>
      <DetailBackButton to="/" label="Retour à l'accueil" />
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(280px,420px)]">
        <div className="relative overflow-hidden rounded-xl bg-muted/60">
          <ProductImage src={item.image} alt={item.itemName} className="aspect-square w-full" />
          <InCartBadge quantity={cartQuantity} />
        </div>
        <div className="flex flex-col gap-5">
          <PageTitle title={item.itemName} description={item.itemGroup} />
          {plainText(item.description) ? (
            <p className="text-sm text-muted-foreground">{plainText(item.description)}</p>
          ) : null}
          <p className="text-sm text-muted-foreground">Réf. {item.itemCode} · {item.uom}</p>
          <ProductPrice item={item} />
          <QuantitySelector value={quantity} onChange={setQuantity} name={item.itemName} uom={item.uom} />
          <Button disabled={adding} onClick={add}>
            {adding && !added ? <Spinner data-icon="inline-start" /> : added ? <Check data-icon="inline-start" /> : <ShoppingCart data-icon="inline-start" />}
            {added ? "Ajouté" : "Ajouter au panier"}
          </Button>
        </div>
      </div>
    </>
  )
}
