import { Bell } from "lucide-react"
import { FilterSelect } from "@/components/FilterSelect"
import { ErrorState } from "@/components/LoadState"
import { PageTitle } from "@/components/PageTitle"
import { Paginator } from "@/components/Paginator"
import { Button } from "@/components/ui/button"
import { NotificationList } from "@/features/notifications/NotificationList"
import { useNotificationActions, useNotifications } from "@/shared/api"
import { paramOrAll, useListQuery } from "@/shared/listQuery"
import type { PortalNotification } from "@/shared/types"
import { useNavigate } from "react-router-dom"

const FILTER_OPTIONS = [
  { value: "all", label: "Toutes" },
  { value: "unread", label: "Non lues" },
] as const

export function NotificationsPage() {
  const navigate = useNavigate()
  const { params, patch } = useListQuery()
  const filter = paramOrAll(params.get("status")) === "unread" ? "unread" : "all"
  const page = Math.max(Number(params.get("page") || "1") || 1, 1)
  const { data, isLoading, error, mutate } = useNotifications(page, filter === "unread")
  const actions = useNotificationActions()
  const payload = data?.message
  const items = payload?.items || []

  const select = async (item: PortalNotification) => {
    if (!item.read) {
      try {
        await actions.markRead(item.name)
        await mutate()
      } catch {
        // Still open the related document.
      }
    }
    if (item.link) navigate(item.link)
  }

  const markAll = async () => {
    await actions.markAllRead()
    await mutate()
  }

  return (
    <>
      <PageTitle
        title="Notifications"
        description="Suivi de vos commandes, livraisons, paiements et demandes."
        action={
          items.some((item) => !item.read) ? (
            <Button type="button" variant="outline" onClick={() => void markAll()} disabled={actions.saving}>
              <Bell data-icon="inline-start" />
              Tout marquer comme lu
            </Button>
          ) : null
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <FilterSelect
          label="Affichage"
          value={filter}
          options={FILTER_OPTIONS}
          onChange={(value) => patch({ status: value, page: 1 })}
        />
      </div>
      {error ? <ErrorState error={error} /> : null}
      <NotificationList items={items} loading={isLoading} onSelect={(item) => void select(item)} />
      {payload ? (
        <Paginator page={payload.page} hasNext={payload.hasNext} onChange={(next) => patch({ page: next })} />
      ) : null}
    </>
  )
}
