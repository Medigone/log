import { useState } from "react"
import { useNavigate } from "react-router-dom"
import { useFrappeAuth } from "frappe-react-sdk"
import { Bell } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverHeader, PopoverTitle, PopoverTrigger } from "@/components/ui/popover"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { NotificationList, NotificationSeeAllLink, formatUnreadBadge } from "@/features/notifications/NotificationList"
import { useIsMobile } from "@/hooks/use-mobile"
import { useNotificationActions, useNotifications, usePortalContext } from "@/shared/api"
import type { PortalNotification } from "@/shared/types"

function BellTriggerContent({ count }: { count: number }) {
  const badge = formatUnreadBadge(count)
  return (
    <span className="relative">
      <Bell />
      {badge ? (
        <span
          aria-hidden
          className="absolute -top-1.5 -right-2.5 z-10 flex h-4 min-w-4 items-center justify-center overflow-visible rounded-full bg-warning px-1 text-[10px] font-semibold leading-none text-foreground"
        >
          {badge}
        </span>
      ) : null}
    </span>
  )
}

function PanelBody({
  items,
  loading,
  onSelect,
  onSeeAll,
  onMarkAll,
  unread,
}: {
  items: PortalNotification[]
  loading: boolean
  onSelect: (item: PortalNotification) => void
  onSeeAll: () => void
  onMarkAll: () => void
  unread: number
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <NotificationList items={items} loading={loading} onSelect={onSelect} />
      <div className="flex min-w-0 items-center justify-between gap-2 px-3 py-2">
        {unread > 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={onMarkAll}>
            Tout marquer comme lu
          </Button>
        ) : (
          <span />
        )}
        <NotificationSeeAllLink onClick={onSeeAll} />
      </div>
    </div>
  )
}

export function NotificationButton() {
  const isMobile = useIsMobile()
  const navigate = useNavigate()
  const { currentUser } = useFrappeAuth()
  const context = usePortalContext(currentUser)
  const unread = context.data?.message?.unreadNotifications ?? 0
  const [open, setOpen] = useState(false)
  const list = useNotifications(1, false, open, 10)
  const actions = useNotificationActions()
  const items = list.data?.message?.items || []
  const badge = formatUnreadBadge(unread)
  const label = badge ? `Notifications, ${badge} non lues` : "Notifications"

  const refresh = async () => {
    await Promise.all([list.mutate(), context.mutate()])
  }

  const close = () => setOpen(false)

  const select = async (item: PortalNotification) => {
    close()
    if (!item.read) {
      try {
        await actions.markRead(item.name)
        await refresh()
      } catch {
        // Navigation takes priority if the mark-read call fails.
      }
    }
    if (item.link) navigate(item.link)
  }

  const markAll = async () => {
    try {
      await actions.markAllRead()
      await refresh()
    } catch {
      // Keep the panel open so the user can retry.
    }
  }

  const panel = (
    <PanelBody
      items={items}
      loading={list.isLoading}
      onSelect={(item) => void select(item)}
      onSeeAll={close}
      onMarkAll={() => void markAll()}
      unread={unread}
    />
  )

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger render={<Button variant="ghost" size="icon-lg" className="size-11 shrink-0" aria-label={label} />}>
          <BellTriggerContent count={unread} />
        </SheetTrigger>
        <SheetContent side="right" className="w-full gap-0 p-0">
          <SheetHeader>
            <SheetTitle>Notifications</SheetTitle>
            <SheetDescription>Suivi de vos commandes, livraisons et paiements.</SheetDescription>
          </SheetHeader>
          <div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">{panel}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="icon-lg" className="size-11 shrink-0" aria-label={label} />}>
        <BellTriggerContent count={unread} />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-1.5rem)] overflow-hidden p-0">
        <PopoverHeader className="border-b px-3 py-2.5">
          <PopoverTitle>Notifications</PopoverTitle>
        </PopoverHeader>
        <div className="max-h-96 min-w-0 overflow-x-hidden overflow-y-auto">{panel}</div>
      </PopoverContent>
    </Popover>
  )
}
