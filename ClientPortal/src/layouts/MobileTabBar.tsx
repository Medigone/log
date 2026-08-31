import { Link, useLocation } from "react-router-dom"
import { useCart } from "@/cart/CartContext"
import { offerCount } from "@/features/store/catalogQuery"
import { isStoreNavActive, mobileStoreNav } from "@/layouts/storeNav"
import { cn } from "@/lib/utils"
import { useStorefront } from "@/shared/api"

function formatBadge(count: number) {
  if (count <= 0) return null
  return count > 99 ? "99+" : String(count)
}

function TabBadge({ value }: { value: number }) {
  const label = formatBadge(value)
  if (!label) return null
  return (
    <span aria-hidden className="absolute -top-1.5 -right-2.5 z-10 flex h-4 min-w-4 items-center justify-center overflow-visible rounded-full bg-warning px-1 text-[10px] font-semibold leading-none text-foreground">
      {label}
    </span>
  )
}

export function MobileTabBar() {
  const location = useLocation()
  const cart = useCart()
  const storefront = useStorefront()
  const offers = offerCount(storefront.data?.message)

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed inset-x-0 bottom-0 z-40 overflow-visible border-t border-border bg-background pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="grid h-14 grid-cols-4 overflow-visible">
        {mobileStoreNav.map((item) => {
          const Icon = item.icon
          const active = isStoreNavActive(item.match, location.pathname, location.search)
          const badge = item.match === "offres" ? offers : item.match === "cart" ? cart.count : 0
          const accessible = badge > 0 ? `${item.label}, ${badge}` : item.label
          return (
            <li key={item.match} className="min-w-0 overflow-visible">
              <Link
                to={item.to}
                aria-label={accessible}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-14 min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 px-1 text-[11px] leading-none outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  active ? "font-semibold text-foreground" : "font-medium text-neutral-600",
                )}
              >
                <span className="relative overflow-visible">
                  <Icon className="size-5" aria-hidden />
                  <TabBadge value={badge} />
                </span>
                <span className="max-w-full truncate">{item.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
