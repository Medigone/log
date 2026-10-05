import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import type { CartLine, CatalogItem } from "@/shared/types"

interface CartContextValue {
  lines: CartLine[]
  count: number
  total: number
  add: (item: CatalogItem, quantity?: number) => void
  updateQuantity: (itemCode: string, quantity: number) => void
  remove: (itemCode: string) => void
  clear: () => void
}

const CartContext = createContext<CartContextValue | null>(null)

function readCart(key: string): CartLine[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "[]")
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

/** Plafonne la quantité au quota de l'article (vente en quota). */
function capQuantity(item: Pick<CatalogItem, "maxQty">, quantity: number) {
  return item.maxQty && item.maxQty > 0 ? Math.min(quantity, item.maxQty) : quantity
}

export function CartProvider({ user, children }: { user: string; children: ReactNode }) {
  const storageKey = `intrapro-client.cart.${user}`
  const [lines, setLines] = useState<CartLine[]>(() => readCart(storageKey))

  const persist = useCallback((next: CartLine[]) => {
    setLines(next)
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // Le panier reste utilisable en mémoire si le stockage privé est indisponible.
    }
  }, [storageKey])

  const value = useMemo<CartContextValue>(() => ({
    lines,
    count: lines.reduce((sum, line) => sum + line.quantity, 0),
    total: lines.reduce((sum, line) => sum + line.quantity * (line.showPrice === false ? 0 : line.unitPriceTtc || 0), 0),
    add: (item, quantity = 1) => {
      const qty = Math.max(1, Math.floor(Number(quantity) || 1))
      const existing = lines.find((line) => line.itemCode === item.itemCode)
      persist(existing
        ? lines.map((line) => line.itemCode === item.itemCode
          ? {
              ...line,
              ...item,
              quantity: capQuantity(item, line.quantity + qty),
              campaign: item.campaign ?? line.campaign,
              placement: item.placement ?? line.placement,
            }
          : line)
        : [...lines, { ...item, quantity: capQuantity(item, qty) }])
    },
    updateQuantity: (itemCode, quantity) => persist(
      quantity <= 0
        ? lines.filter((line) => line.itemCode !== itemCode)
        : lines.map((line) => line.itemCode === itemCode ? { ...line, quantity: capQuantity(line, quantity) } : line),
    ),
    remove: (itemCode) => persist(lines.filter((line) => line.itemCode !== itemCode)),
    clear: () => persist([]),
  }), [lines, persist])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) throw new Error("useCart doit être utilisé dans CartProvider")
  return context
}
