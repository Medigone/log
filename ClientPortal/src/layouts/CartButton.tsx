import { NavLink } from "react-router-dom"
import { ShoppingCart } from "lucide-react"
import { useCart } from "@/cart/CartContext"
import { Button } from "@/components/ui/button"
import { formatMoney } from "@/shared/format"

export function CartButton() {
  const cart = useCart()
  const priced = cart.lines.filter((line) => line.showPrice !== false && line.unitPriceTtc != null)
  const currency = priced[0]?.currency
  const showAmount = priced.length > 0 && currency
  const label = cart.count > 0 ? `Panier (${cart.count})` : "Panier"

  return (
    <Button
      className="h-auto min-h-9 flex-col gap-0 px-3 py-1.5"
      render={<NavLink to="/cart" />}
      nativeButton={false}
      aria-label={label}
    >
      <span className="flex items-center gap-1.5 leading-none">
        <ShoppingCart data-icon="inline-start" />
        Panier{cart.count > 0 ? ` · ${cart.count}` : ""}
      </span>
      {showAmount ? (
        <span className="text-[0.65rem] font-normal opacity-90">{formatMoney(cart.total, currency)}</span>
      ) : null}
    </Button>
  )
}
