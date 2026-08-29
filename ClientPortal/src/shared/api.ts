import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk"
import type {
  Balance,
  CatalogPage,
  CommuneOption,
  DeliverySummary,
  GpsPosition,
  OrderPreview,
  OrderSummary,
  Page,
  PaymentSummary,
  PortalContext,
  StorefrontPayload,
} from "@/shared/types"

interface FrappeMessage<T> {
  message: T
}

const API = "log.api.client_portal"

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

export function useCatalog(search: string, itemGroup: string, page: number, enabled = true, pageLength = 12) {
  return useFrappeGetCall<FrappeMessage<CatalogPage>>(
    `${API}.get_catalog`,
    { search, item_group: itemGroup, page, page_length: pageLength },
    enabled ? `client-catalog-${search}-${itemGroup}-${page}-${pageLength}` : null,
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
