export interface PortalUser {
  name: string
  fullName: string
  email: string
}

export interface PortalCustomer {
  name: string
  customerName: string
  phone?: string | null
  email?: string | null
  commune?: string | null
  communeName?: string | null
  wilaya?: string | null
  wilayaName?: string | null
  image?: string | null
}

export interface Balance {
  company: string
  currency: string
  amount: number
}

export interface PortalContext {
  user: PortalUser
  customer: PortalCustomer
  company: string
  currency: string
  gpsConfigured: boolean
  gpsLatitude?: number | null
  gpsLongitude?: number | null
  gpsAccuracy?: number | null
  gpsCapturedAt?: string | null
  mustChangePassword: boolean
  today?: string
  balances: Balance[]
  inProgressOrders?: string[]
  unreadNotifications?: number
}

export interface CatalogItem {
  itemCode: string
  itemName: string
  description?: string | null
  itemGroup: string
  uom: string
  image?: string | null
  showPrice?: boolean
  unitPriceTtc: number | null
  catalogPriceTtc?: number | null
  effectivePriceTtc?: number | null
  savingsTtc?: number | null
  offerLabel?: string | null
  offerCondition?: string | null
  campaign?: string | null
  campaignTitle?: string | null
  placement?: string | null
  currency: string
  lastQuantity?: number
}

export interface StorefrontCta {
  type: "catalog" | "group" | "item"
  itemGroup?: string | null
  itemCode?: string | null
  label: string
}

export interface CampaignOffer {
  type: "percentage" | "amount" | "rate" | "product" | "coupon" | null
  percentage?: number | null
  amount?: number | null
  label?: string | null
  currency?: string | null
  condition?: string | null
  minQty?: number | null
  couponCode?: string | null
}

export interface StorefrontCampaign {
  campaign?: string | null
  campaignTitle?: string | null
  placement?: string | null
  priority?: number
  title: string
  body?: string | null
  cta: StorefrontCta
  offer?: CampaignOffer | null
  offerLabel?: string | null
  offerCondition?: string | null
  validFrom?: string | null
  validUpto?: string | null
  expiringSoon?: boolean
  itemCodes?: string[]
  itemGroups?: string[]
  items?: CatalogItem[]
  kind?: "campaign" | "group"
}

export type StorefrontHero = StorefrontCampaign
export type StorefrontRail = StorefrontCampaign

export interface StorefrontPayload {
  campaigns?: StorefrontCampaign[]
  banners: StorefrontCampaign[]
  categories: Array<{ name: string }>
  rails: StorefrontCampaign[]
  customerName?: string
  computedStatus?: string | null
}

export interface CatalogPage {
  items: CatalogItem[]
  groups: string[]
  page: number
  pageLength: number
  hasNext: boolean
  total?: number
}

export interface CartLine extends CatalogItem {
  quantity: number
}

export interface OrderLine {
  itemCode: string
  itemName: string
  quantity: number
  deliveredQuantity?: number
  remainingQuantity?: number
  deliveredLineTotalTtc?: number
  uom: string
  unitPriceTtc: number
  lineTotalTtc: number
  image?: string | null
  isFreeItem?: boolean
  discountPercentage?: number
}

export interface OrderPreview {
  items: OrderLine[]
  totalQuantity: number
  totalTtc: number
  discountAmount?: number
  netTotal?: number
  currency: string
  deliveryDate: string
  requiresGps: boolean
  pricingRules?: string[]
  couponCode?: string | null
}

export interface OrderSummary {
  name: string
  transactionDate: string
  deliveryDate: string
  status: string
  docstatus: number
  totalQuantity: number
  deliveredQuantity?: number
  remainingQuantity?: number
  deliveredTotalTtc?: number
  totalTtc: number
  currency: string
  modified: string
  source?: string | null
  canEdit: boolean
  items?: OrderLine[]
  deliveries?: DeliverySummary[]
}

export interface DeliveryLine {
  itemCode: string
  itemName: string
  quantity: number
  uom: string
  image?: string | null
}

export interface DeliverySummary {
  name: string
  postingDate: string
  deliveryDate: string
  status: string
  docstatus: number
  totalQuantity: number
  totalTtc: number
  currency: string
  salesOrders?: string[]
  items?: DeliveryLine[]
}

export interface PaymentSummary {
  name: string
  date: string
  method: string
  amount: number
  status: string
  deliveryNote?: string | null
  paymentEntry?: string | null
}

export interface Page<T> {
  items: T[]
  page: number
  pageLength: number
  hasNext: boolean
}

export interface CommuneOption {
  name: string
  nom: string
  wilaya: string
  wilayaName: string
}

export interface CustomerCategoryOption {
  name: string
  label: string
}

export interface SignupOptions {
  communes: CommuneOption[]
  categories: CustomerCategoryOption[]
}

export interface GpsPosition {
  latitude: number
  longitude: number
  accuracy: number
}

export interface CatalogRequestLine {
  name?: string
  designation: string
  quantity: number
  reference?: string | null
  notes?: string | null
  photo?: string | null
  itemCode?: string | null
}

export interface CatalogRequest {
  name: string
  status: string
  customer?: string
  deliveryDate: string
  comment?: string | null
  refusalReason?: string | null
  orderId?: string | null
  modified: string
  creation: string
  itemCount: number
  canCancel: boolean
  items?: CatalogRequestLine[]
}

export type NotificationCategory = "commandes" | "livraisons" | "paiements" | "demandes" | "promotions"

export interface PortalNotification {
  name: string
  category: NotificationCategory
  eventType: string
  title: string
  body?: string | null
  link?: string | null
  documentType?: string | null
  documentName?: string | null
  read: boolean
  creation: string
}

export type NotificationPreferences = Record<NotificationCategory, number>
