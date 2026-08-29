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
  balances: Balance[]
  inProgressOrders?: string[]
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
}

export interface StorefrontCta {
  type: "catalog" | "group" | "item" | "rail"
  itemGroup?: string | null
  itemCode?: string | null
  label: string
}

export interface StorefrontHero {
  campaign?: string | null
  campaignTitle?: string | null
  placement?: string | null
  title: string
  body?: string | null
  image?: string | null
  imageMobile?: string | null
  cta: StorefrontCta
  offerLabel?: string | null
  offerCondition?: string | null
}

export interface StorefrontRail extends StorefrontHero {
  kind?: "campaign" | "group"
  items: CatalogItem[]
}

export interface StorefrontPayload {
  hero: StorefrontHero
  banners: StorefrontHero[]
  categories: Array<{ name: string }>
  rails: StorefrontRail[]
  customerName?: string
  computedStatus?: string | null
}

export interface CatalogPage {
  items: CatalogItem[]
  groups: string[]
  page: number
  pageLength: number
  hasNext: boolean
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

export interface GpsPosition {
  latitude: number
  longitude: number
  accuracy: number
}
