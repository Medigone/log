import { Bell, ClipboardList, PackageCheck, Banknote, PackagePlus, Tag } from "lucide-react"
import { NavLink } from "react-router-dom"
import { EmptyState } from "@/components/LoadState"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { formatRelativeDateTime } from "@/shared/format"
import type { NotificationCategory, PortalNotification } from "@/shared/types"

const CATEGORY_ICON = {
  commandes: ClipboardList,
  livraisons: PackageCheck,
  paiements: Banknote,
  demandes: PackagePlus,
  promotions: Tag,
} as const

const CATEGORY_LABEL: Record<NotificationCategory, string> = {
  commandes: "Commandes",
  livraisons: "Livraisons",
  paiements: "Paiements",
  demandes: "Demandes",
  promotions: "Promotions",
}

export function notificationCategoryLabel(category: NotificationCategory) {
  return CATEGORY_LABEL[category]
}

export function formatUnreadBadge(count: number) {
  if (count <= 0) return null
  return count > 99 ? "99+" : String(count)
}

export function NotificationList({
  items,
  loading,
  emptyTitle = "Aucune notification",
  emptyDescription = "Les mises à jour de vos commandes, livraisons et paiements apparaîtront ici.",
  onSelect,
}: {
  items: PortalNotification[]
  loading?: boolean
  emptyTitle?: string
  emptyDescription?: string
  onSelect: (item: PortalNotification) => void
}) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2 p-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-14 rounded-lg" />
        ))}
      </div>
    )
  }

  if (!items.length) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  return (
    <ItemGroup className="min-w-0 gap-0">
      {items.map((item) => {
        const Icon = CATEGORY_ICON[item.category] || Bell
        return (
          <Item
            key={item.name}
            size="sm"
            className={cn(
              "min-h-11 min-w-0 flex-nowrap rounded-none border-b last:border-b-0",
              !item.read && "bg-muted/50",
            )}
            render={<button type="button" onClick={() => onSelect(item)} />}
          >
            <ItemMedia variant="icon">
              <Icon aria-hidden />
            </ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle className={cn("w-auto max-w-full min-w-0", !item.read && "font-semibold")}>
                {item.title}
              </ItemTitle>
              <ItemDescription className="min-w-0">
                {item.body || notificationCategoryLabel(item.category)}
                {" · "}
                {formatRelativeDateTime(item.creation)}
              </ItemDescription>
            </ItemContent>
            {!item.read ? (
              <Badge variant="warning" className="shrink-0">
                Nouveau
              </Badge>
            ) : null}
          </Item>
        )
      })}
    </ItemGroup>
  )
}

export function NotificationSeeAllLink({ onClick }: { onClick?: () => void }) {
  return (
    <Button variant="ghost" size="sm" className="shrink-0" render={<NavLink to="/notifications" />} nativeButton={false} onClick={onClick}>
      Tout voir
    </Button>
  )
}
