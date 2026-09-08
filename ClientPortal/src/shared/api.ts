import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk"
import type {
  Balance,
  CatalogItem,
  CatalogPage,
  CatalogRequest,
  CommuneOption,
  DeliverySummary,
  GpsPosition,
  NotificationPreferences,
  OrderPreview,
  OrderSummary,
  Page,
  PaymentSummary,
  PortalContext,
  PortalNotification,
  SignupOptions,
  StorefrontPayload,
} from "@/shared/types"

interface FrappeMessage<T> {
  message: T
}

const API = "log.api.client_portal"
const REQUESTS_API = "log.api.catalog_requests"
const NOTIFICATIONS_API = "log.api.portal_notifications"
const SIGNUP_API = "log.api.customer_signup"

export function apiErrorMessage(error: unknown): string {
  if (typeof error === "string") return error
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>
    const direct = [value.message, value.httpStatusText, value.exception].find(
      (item): item is string => typeof item === "string" && item.length > 0,
    )
    if (direct) return direct.replace(/<[^>]+>/g, "")
  }
  return "Une erreur inattendue est survenue."
}

export function usePortalContext(currentUser?: string | null) {
  return useFrappeGetCall<FrappeMessage<PortalContext>>(
    `${API}.get_portal_context`,
    undefined,
    currentUser ? `client-portal-context-${currentUser}` : null,
    {
      revalidateOnFocus: true,
      refreshInterval: 20_000,
    },
  )
}

export function useCatalog(
  search: string,
  itemGroup: string,
  page: number,
  enabled = true,
  pageLength = 12,
  orderBy = "relevance",
  offersOnly = false,
  campaign = "",
) {
  return useFrappeGetCall<FrappeMessage<CatalogPage>>(
    `${API}.get_catalog`,
    {
      search,
      item_group: itemGroup,
      page,
      page_length: pageLength,
      order_by: orderBy,
      offers_only: offersOnly ? 1 : 0,
      campaign,
    },
    enabled ? `client-catalog-${search}-${itemGroup}-${page}-${pageLength}-${orderBy}-${offersOnly ? 1 : 0}-${campaign}` : null,
  )
}

export function useRecentOrderItems(enabled = true, limit = 8) {
  return useFrappeGetCall<FrappeMessage<{ items: CatalogItem[] }>>(
    `${API}.get_recent_order_items`,
    { limit },
    enabled ? `client-recent-order-items-${limit}` : null,
  )
}

export function useStorefront() {
  return useFrappeGetCall<FrappeMessage<StorefrontPayload>>(
    `${API}.get_storefront`,
    undefined,
    "client-storefront",
  )
}

export function useProduct(itemCode?: string) {
  return useFrappeGetCall<FrappeMessage<import("@/shared/types").CatalogItem>>(
    `${API}.get_product`,
    { item_code: itemCode },
    itemCode ? `client-product-${itemCode}` : null,
  )
}

export interface OrderListQuery {
  page: number
  search?: string
  status?: string
  source?: string
  fromDate?: string
  toDate?: string
  orderBy?: string
}

export function useOrders(query: OrderListQuery) {
  const params = {
    page: query.page,
    page_length: 20,
    search: query.search || "",
    status: query.status || "",
    source: query.source || "",
    from_date: query.fromDate || "",
    to_date: query.toDate || "",
    order_by: query.orderBy || "date_desc",
  }
  return useFrappeGetCall<FrappeMessage<Page<OrderSummary>>>(
    `${API}.get_orders`,
    params,
    `client-orders-${params.page}-${params.search}-${params.status}-${params.source}-${params.from_date}-${params.to_date}-${params.order_by}`,
  )
}

export function useOrder(orderId?: string) {
  return useFrappeGetCall<FrappeMessage<OrderSummary>>(
    `${API}.get_order`,
    { order_id: orderId },
    orderId ? `client-order-${orderId}` : null,
  )
}

export interface DeliveryListQuery {
  page: number
  search?: string
  status?: string
  fromDate?: string
  toDate?: string
  orderBy?: string
}

export function useDeliveries(query: DeliveryListQuery) {
  const params = {
    page: query.page,
    page_length: 20,
    search: query.search || "",
    status: query.status || "",
    from_date: query.fromDate || "",
    to_date: query.toDate || "",
    order_by: query.orderBy || "date_desc",
  }
  return useFrappeGetCall<FrappeMessage<Page<DeliverySummary>>>(
    `${API}.get_delivery_notes`,
    params,
    `client-deliveries-${params.page}-${params.search}-${params.status}-${params.from_date}-${params.to_date}-${params.order_by}`,
  )
}

export function useDelivery(deliveryId?: string) {
  return useFrappeGetCall<FrappeMessage<DeliverySummary>>(
    `${API}.get_delivery_note`,
    { delivery_note_id: deliveryId },
    deliveryId ? `client-delivery-${deliveryId}` : null,
  )
}

export function usePayments(page: number) {
  return useFrappeGetCall<FrappeMessage<Page<PaymentSummary>>>(
    `${API}.get_payments`,
    { page, page_length: 20 },
    `client-payments-${page}`,
  )
}

export function useBalance() {
  return useFrappeGetCall<FrappeMessage<{ balances: Balance[]; asOf: string }>>(
    `${API}.get_current_balance`,
    undefined,
    "client-current-balance",
  )
}

export function useOrderActions() {
  const preview = useFrappePostCall<FrappeMessage<OrderPreview>>(`${API}.preview_order`)
  const create = useFrappePostCall<FrappeMessage<OrderSummary>>(`${API}.create_order`)
  const update = useFrappePostCall<FrappeMessage<OrderSummary>>(`${API}.update_order`)
  const remove = useFrappePostCall<FrappeMessage<{ success: boolean; name: string }>>(`${API}.delete_order`)

  return {
    preview: async (payload: {
      items: Array<{ itemCode: string; quantity: number; campaign?: string | null; placement?: string | null }>
      deliveryDate: string
    }) =>
      (await preview.call({ payload })).message,
    create: async (payload: {
      items: Array<{ itemCode: string; quantity: number; campaign?: string | null; placement?: string | null }>
      deliveryDate: string
      gps?: GpsPosition
    }) => (await create.call({ payload })).message,
    update: async (payload: {
      orderId: string
      expectedModified: string
      items: Array<{ itemCode: string; quantity: number }>
      deliveryDate: string
    }) => (await update.call({ payload })).message,
    remove: async (payload: { orderId: string; expectedModified: string }) =>
      (await remove.call({ payload })).message,
    previewing: preview.loading,
    saving: create.loading || update.loading || remove.loading,
  }
}

export function useCommunes() {
  return useFrappeGetCall<FrappeMessage<{ items: CommuneOption[] }>>(
    `${API}.get_communes`,
    undefined,
    "client-communes",
  )
}

export function useProfileActions() {
  const update = useFrappePostCall<
    FrappeMessage<{
      success: boolean
      user: PortalContext["user"]
      customer: PortalContext["customer"]
    }>
  >(`${API}.update_customer_profile`)

  return {
    update: async (payload: { fullName: string; email: string; phone: string; commune: string }) =>
      (await update.call({ payload })).message,
    saving: update.loading,
  }
}

export function useCustomerImageActions() {
  const update = useFrappePostCall<
    FrappeMessage<{
      success: boolean
      customer: PortalContext["customer"]
    }>
  >(`${API}.update_customer_image`)

  return {
    update: async (payload: { imageData: string; filename: string }) =>
      (await update.call({ payload })).message,
    saving: update.loading,
  }
}

export type GpsSource = "device" | "map"

export function useGpsActions() {
  const update = useFrappePostCall<
    FrappeMessage<{
      success: boolean
      gpsConfigured: boolean
      gpsLatitude: number
      gpsLongitude: number
      gpsAccuracy: number
      gpsCapturedAt: string
    }>
  >(`${API}.update_customer_gps`)

  return {
    update: async (payload: {
      source: GpsSource
      latitude: number
      longitude: number
      accuracy?: number
    }) => (await update.call({ payload })).message,
    saving: update.loading,
  }
}

export function usePasswordActions() {
  const change = useFrappePostCall<
    FrappeMessage<{ success: boolean; mustChangePassword: boolean }>
  >(`${API}.change_initial_password`)

  return {
    changeInitialPassword: async (payload: { currentPassword: string; newPassword: string }) =>
      (await change.call({ payload })).message,
    changing: change.loading,
  }
}

export function passwordResetFeedback(result: unknown, error?: unknown): { ok: boolean; message: string } {
  if (error) {
    const raw = apiErrorMessage(error)
    if (/not found|404|DoesNotExist/i.test(raw)) {
      return { ok: false, message: "Aucun compte ne correspond à cet identifiant." }
    }
    return { ok: false, message: raw }
  }
  if (result === "not found") {
    return { ok: false, message: "Aucun compte ne correspond à cet identifiant." }
  }
  if (result === "disabled") {
    return { ok: false, message: "Ce compte est désactivé." }
  }
  if (result === "not allowed") {
    return { ok: false, message: "Cette action n’est pas autorisée." }
  }
  return {
    ok: true,
    message: "Les instructions de réinitialisation ont été envoyées à votre adresse e-mail.",
  }
}

export function usePasswordReset() {
  const reset = useFrappePostCall<FrappeMessage<string | null>>("frappe.core.doctype.user.user.reset_password")
  return {
    send: async (user: string) => passwordResetFeedback((await reset.call({ user })).message),
    sending: reset.loading,
  }
}

export interface CatalogRequestListQuery {
  page: number
  search?: string
  status?: string
  fromDate?: string
  toDate?: string
  orderBy?: string
}

export function useCatalogRequests(query: CatalogRequestListQuery) {
  const params = {
    page: query.page,
    page_length: 20,
    search: query.search || "",
    status: query.status || "",
    from_date: query.fromDate || "",
    to_date: query.toDate || "",
    order_by: query.orderBy || "date_desc",
  }
  return useFrappeGetCall<FrappeMessage<Page<CatalogRequest>>>(
    `${REQUESTS_API}.get_catalog_requests`,
    params,
    `client-catalog-requests-${params.page}-${params.search}-${params.status}-${params.from_date}-${params.to_date}-${params.order_by}`,
  )
}

export function useCatalogRequest(requestId?: string) {
  return useFrappeGetCall<FrappeMessage<CatalogRequest>>(
    `${REQUESTS_API}.get_catalog_request`,
    { request_id: requestId },
    requestId ? `client-catalog-request-${requestId}` : null,
  )
}

export function useCatalogRequestActions() {
  const create = useFrappePostCall<FrappeMessage<CatalogRequest>>(`${REQUESTS_API}.create_catalog_request`)
  const cancel = useFrappePostCall<FrappeMessage<{ success: boolean; name: string }>>(
    `${REQUESTS_API}.cancel_catalog_request`,
  )
  return {
    create: async (payload: {
      deliveryDate: string
      comment?: string
      items: Array<{
        designation: string
        quantity: number
        reference?: string
        notes?: string
        photo?: { filename: string; imageData: string }
      }>
    }) => (await create.call({ payload })).message,
    cancel: async (payload: { requestId: string }) => (await cancel.call({ payload })).message,
    saving: create.loading || cancel.loading,
  }
}

export function usePromotionEvents() {
  const log = useFrappePostCall<FrappeMessage<{ recorded: boolean; duplicate: boolean }>>(
    `${API}.log_promotion_event`,
  )
  return {
    track: async (payload: {
      eventType: "view_promotion" | "select_promotion" | "add_to_cart"
      campaign?: string | null
      placement?: string | null
      itemCode?: string | null
    }) => {
      if (!payload.campaign) return
      await log.call({ payload })
    },
  }
}

export function useNotifications(page = 1, onlyUnread = false, enabled = true, pageLength = 20) {
  return useFrappeGetCall<FrappeMessage<Page<PortalNotification>>>(
    `${NOTIFICATIONS_API}.list_notifications`,
    { page, page_length: pageLength, only_unread: onlyUnread ? 1 : 0 },
    enabled ? `client-notifications-${page}-${onlyUnread ? 1 : 0}-${pageLength}` : null,
  )
}

export function useNotificationActions() {
  const markOne = useFrappePostCall<FrappeMessage<{ notification: PortalNotification; unreadCount: number }>>(
    `${NOTIFICATIONS_API}.mark_read`,
  )
  const markAll = useFrappePostCall<FrappeMessage<{ success: boolean; unreadCount: number }>>(
    `${NOTIFICATIONS_API}.mark_all_read`,
  )
  return {
    markRead: async (name: string) => (await markOne.call({ payload: { name } })).message,
    markAllRead: async () => (await markAll.call({ payload: {} })).message,
    saving: markOne.loading || markAll.loading,
  }
}

export function useNotificationPreferences() {
  return useFrappeGetCall<FrappeMessage<{ categories: NotificationPreferences }>>(
    `${NOTIFICATIONS_API}.get_preferences`,
    undefined,
    "client-notification-preferences",
  )
}

export function useNotificationPreferenceActions() {
  const update = useFrappePostCall<FrappeMessage<{ categories: NotificationPreferences }>>(
    `${NOTIFICATIONS_API}.update_preferences`,
  )
  return {
    update: async (categories: Partial<NotificationPreferences>) =>
      (await update.call({ payload: { categories } })).message,
    saving: update.loading,
  }
}

export function usePushConfig(enabled = true) {
  return useFrappeGetCall<FrappeMessage<{ vapidPublicKey: string; enabled: boolean }>>(
    `${NOTIFICATIONS_API}.get_push_config`,
    undefined,
    enabled ? "client-push-config" : null,
  )
}

export function useSignupOptions() {
  return useFrappeGetCall<FrappeMessage<SignupOptions>>(
    `${SIGNUP_API}.get_signup_options`,
    undefined,
    "customer-signup-options",
  )
}

export function useCustomerSignup() {
  const submit = useFrappePostCall<FrappeMessage<{ success: boolean; message: string }>>(`${SIGNUP_API}.submit_signup`)
  return {
    submit: async (payload: {
      commercialName: string
      firstName: string
      lastName: string
      commune: string
      category: string
      phone: string
      email: string
    }) => (await submit.call({ payload })).message,
    sending: submit.loading,
  }
}

export function usePushSubscriptionActions() {
  const subscribe = useFrappePostCall<FrappeMessage<{ success: boolean; name: string }>>(
    `${NOTIFICATIONS_API}.subscribe_push`,
  )
  const unsubscribe = useFrappePostCall<FrappeMessage<{ success: boolean }>>(
    `${NOTIFICATIONS_API}.unsubscribe_push`,
  )
  return {
    subscribe: async (payload: {
      endpoint: string
      keys: { p256dh: string; auth: string }
      userAgent?: string
    }) => (await subscribe.call({ payload })).message,
    unsubscribe: async (endpoint: string) => (await unsubscribe.call({ payload: { endpoint } })).message,
    saving: subscribe.loading || unsubscribe.loading,
  }
}
