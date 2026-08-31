import { NavLink, useLocation, useNavigate } from "react-router-dom"
import { Search } from "lucide-react"
import { BrandLogo } from "@/components/BrandLogo"
import { Button } from "@/components/ui/button"
import { NotificationButton } from "@/features/notifications/NotificationButton"
import { STORE_SEARCH_ID, type StoreSearchLocationState } from "@/layouts/HeaderSearch"
import { mobileHeaderTitle, searchParamsOf } from "@/layouts/storeNav"

export function MobileHeader() {
  const location = useLocation()
  const navigate = useNavigate()
  const title = mobileHeaderTitle(location.pathname, location.search)

  const openSearch = () => {
    const view = searchParamsOf(location.search).get("view")
    if (location.pathname === "/" && view !== "offres") {
      document.getElementById(STORE_SEARCH_ID)?.focus()
      return
    }
    navigate("/", { state: { focusStoreSearch: true } satisfies StoreSearchLocationState })
  }

  return (
    <header className="sticky top-0 z-30 flex min-h-14 items-center gap-2 border-b bg-background px-3 pt-[env(safe-area-inset-top)]">
      <NavLink to="/" aria-label="IntraPro" className="flex size-11 shrink-0 items-center justify-center">
        <BrandLogo compact className="size-8" />
      </NavLink>
      <h1 className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight">{title}</h1>
      <NotificationButton />
      <Button
        type="button"
        variant="ghost"
        size="icon-lg"
        className="size-11 shrink-0"
        aria-label="Rechercher un article, une référence ou un rayon"
        onClick={openSearch}
      >
        <Search />
      </Button>
    </header>
  )
}
