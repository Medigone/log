export type DistributionRole =
  | "preparateur"
  | "planificateur"
  | "livreur"
  | "caissier"
  | "responsable"
  | "none";

export interface DistributionUser {
  name: string;
  fullName: string;
  email: string;
  role: DistributionRole;
}

export type RouteLifecycle = "Brouillon" | "Publiée" | "En cours" | "Retour dépôt" | "Contrôle caisse" | "Terminée" | "Annulée";

export interface RouteDepot {
  name: string;
  label: string;
  address?: string;
  latitude: number;
  longitude: number;
  isDefault: boolean;
}

export interface RouteGeometry {
  type: "LineString";
  coordinates: Array<[number, number]>;
}

export interface RouteItinerary {
  status: "ready" | "stale" | "not_calculated";
  provider: "openrouteservice" | string;
  profile: string;
  optimizationEnabled: boolean;
  geometry?: RouteGeometry;
  distanceMeters?: number;
  durationSeconds?: number;
  stopDurationMinutes?: number;
  stopDurationSeconds?: number;
  totalDurationSeconds?: number;
  calculatedAt?: string;
  revision?: number;
}

export interface RouteOptimizationMetrics {
  distanceMeters: number;
  durationSeconds: number;
  stopDurationMinutes?: number;
  stopDurationSeconds?: number;
  totalDurationSeconds?: number;
}

export interface RouteOptimizationProposal {
  routeId: string;
  revision: number;
  currentOrder: string[];
  optimizedOrder: string[];
  current: RouteOptimizationMetrics;
  optimized: RouteOptimizationMetrics;
}

export interface RouteStopTax {
  description: string;
  rate?: number;
  taxAmount: number;
}

export interface RouteStop {
  deliveryNote: string;
  salesOrder?: string;
  customer: string;
  customerName: string;
  commune?: string;
  wilaya?: string;
  latitude?: number;
  longitude?: number;
  customerGpsStatus: "known" | "missing";
  requiresCustomerGeolocation: boolean;
  totalQuantity: number;
  amountCollected: number;
  amountToCollect: number;
  netTotal?: number;
  grandTotal?: number;
  taxes?: RouteStopTax[];
  payments: StopPayment[];
  salesInvoice?: string;
  invoiceStatus: "Non créée" | "Créée" | "Erreur" | "Sans objet" | string;
  residualDeliveryNote?: string;
  status: string;
  planningStatus: PlanningStatus;
  requestedDate?: string;
  plannedDate?: string;
  routeId?: string;
  planningAlert?: string;
  qrCode?: string;
  packageCount?: number;
  postingDate?: string;
  sequence: number;
  address?: string;
  phone?: string;
  instructions?: string;
  items?: RouteStopItem[];
}

export interface StopPayment {
  name: string;
  date?: string;
  method: string;
  amount: number;
  collectionDate?: string;
  status: "Déclaré" | "À contrôler" | "Validé" | "Écart" | "Annulé" | string;
  salesInvoice?: string;
  paymentEntry?: string;
  chequeNumber?: string;
}

export interface RouteStopItem {
  name: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  deliveredQuantity: number;
  remainingQuantity: number;
  rate?: number;
  amount?: number;
}

export interface RouteDraft {
  name?: string;
  date: string;
  plannedStart?: string;
  plannedEnd?: string;
  driver?: string;
  vehicle?: string;
  expectedRevision?: number;
  stops: Array<Pick<RouteStop, "deliveryNote">>;
}

export interface DistributionRoute {
  name: string;
  date: string;
  lifecycle: RouteLifecycle;
  plannedStart?: string;
  plannedEnd?: string;
  revision: number;
  publishedRevision: number;
  acknowledgedRevision: number;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  needsReview: boolean;
  reviewReason?: string;
  driver?: string;
  driverName?: string;
  vehicle?: string;
  vehicleLabel?: string;
  vehicleCapacity?: number;
  totalQuantity: number;
  totalArticles?: number;
  totalCollected: number;
  totalAmount: number;
  stops: RouteStop[];
  depot?: RouteDepot;
  routing: RouteItinerary;
  stock: RouteStockSummary;
  cash: CashReconciliation;
  alerts: string[];
}

export interface DriverRouteCard {
  name: string;
  date: string;
  lifecycle: RouteLifecycle | string;
  plannedStart?: string | null;
  customerLabel: string;
  stopCount: number;
  totalArticles: number;
  locationLabel: string;
}

export interface DriverRouteBoard {
  programmed: DistributionRoute[];
  history: DriverRouteCard[];
  programmedCount: number;
}

export interface PlanningResource {
  name: string;
  label: string;
  active: boolean;
  vehicle?: string;
  capacity?: number;
}

export interface PlanningBoard {
  dateFrom: string;
  dateTo: string;
  unassigned: RouteStop[];
  assignments: DeliveryNoteAssignment[];
  routes: DistributionRoute[];
  drivers: PlanningResource[];
  vehicles: PlanningResource[];
  exceptions: DistributionException[];
}

export type PlanningStatus =
  | "Non planifié"
  | "Planifié"
  | "Publié"
  | "En retard"
  | "À revalider"
  | "À repréparer"
  | "En cours"
  | "En attente retour"
  | "Terminé"
  | "Exception";

export interface DeliveryNoteAssignment extends RouteStop {
  route?: string;
  driver?: string;
  vehicle?: string;
  routeLifecycle?: RouteLifecycle;
  plannedStart?: string;
  plannedEnd?: string;
  routeRevision: number;
}

export interface PlanningFilters {
  search?: string;
  status?: PlanningStatus | "";
  driver?: string;
  vehicle?: string;
  route?: string;
  wilaya?: string;
  alertsOnly?: boolean;
  /** Ignore the planning date window and return every route. */
  allDates?: boolean;
}

export interface PlanningAlert {
  type: "capacity" | "schedule" | "change" | "exception";
  message: string;
  blocking: boolean;
}

export interface RouteRevision {
  routeId: string;
  revision: number;
  publishedRevision: number;
  acknowledgedRevision: number;
}

export interface AssignmentChange {
  deliveryNote: string;
  targetRouteId?: string;
  plannedDate: string;
  plannedStart: string;
  plannedEnd: string;
  driver: string;
  vehicle: string;
  position?: number;
  reason?: string;
  expectedSourceRevision?: number;
  expectedTargetRevision?: number;
}

export interface OrderChangeImpact {
  salesOrder: string;
  revision: number;
  pickLists: string[];
  deliveryNotes: string[];
  routes: string[];
  legacyGroupedPickList: boolean;
  blockers: string[];
}

export interface DistributionException {
  name: string;
  statut: "Ouverte" | "En traitement" | "Résolue" | "Annulée";
  type_exception: string;
  priorite: string;
  bon_de_livraison: string;
  commande_client?: string;
  tournee?: string;
  description: string;
  date_signalement: string;
}

export interface SaveRouteResult {
  route: DistributionRoute;
  warning?: string;
}

export interface StopCompletionResult {
  success: boolean;
  idempotent: boolean;
  customerLocationUpdated: boolean;
  payment?: string;
  accounting?: DeliveryAccountingResult;
  route: DistributionRoute;
}

export interface PublicTrackingStep {
  key: string;
  label: string;
  completed: boolean;
  completed_at?: string;
}

export interface PublicTrackingData {
  name: string;
  status: string;
  steps: PublicTrackingStep[];
  articles: Array<{
    item_code: string;
    item_name: string;
    quantity: number;
    delivered_quantity: number;
  }>;
}

export type DeliveryOutcome = "delivered" | "partial" | "failed";

export interface DeliveryItemInput {
  itemName: string;
  deliveredQuantity: number;
  failureReason?: string;
  comment?: string;
}

export interface PaymentInput {
  method: "cash" | "cheque";
  amount: number;
  chequePhotoData?: string;
  collectionDate?: string;
  chequeNumber?: string;
}

export interface DeliveryAccountingResult {
  deliveryNote: string;
  residualDeliveryNote?: string;
  salesInvoice?: string;
  invoiceStatus: "created" | "error" | "not_applicable" | string;
}

export interface RouteLoadLine {
  name: string;
  deliveryNote: string;
  deliveryNoteItem: string;
  residualDeliveryNote?: string;
  itemCode: string;
  itemName?: string;
  batchNo?: string;
  sourceWarehouse: string;
  vehicleWarehouse: string;
  returnWarehouse?: string;
  loadedQuantity: number;
  deliveredQuantity: number;
  remainingQuantity: number;
  returnedQuantity: number;
  uom?: string;
}

export interface RouteStockSummary {
  status: "À charger" | "Chargé" | "Retour requis" | "Retour déclaré" | "Retourné" | "Exception" | string;
  loadingStockEntry?: string;
  returnStockEntry?: string;
  loadedQuantity: number;
  deliveredQuantity: number;
  remainingQuantity: number;
  returnedQuantity: number;
  returnDeclaredAt?: string;
  returnConfirmedAt?: string;
  lines: RouteLoadLine[];
}

export interface RouteReturnInput {
  routeId: string;
  expectedRevision: number;
  requestId: string;
  lines: Array<{ lineName: string; quantity: number }>;
}

export interface InvoiceAllocation {
  salesInvoice: string;
  dueDate?: string;
  outstandingBefore: number;
  allocatedAmount: number;
}

export interface CashCollection {
  name: string;
  deliveryNote: string;
  salesInvoice?: string;
  customer: string;
  customerName?: string;
  method: "Espèce" | "Chèque" | string;
  amount: number;
  countedAmount: number;
  status: string;
  chequeNumber?: string;
  chequeDate?: string;
  chequePhoto?: string;
  paymentEntry?: string;
  allocations: InvoiceAllocation[];
  unallocatedAmount: number;
}

export interface CashReconciliation {
  routeId: string;
  routeLifecycle: RouteLifecycle;
  status: "Sans encaissement" | "À contrôler" | "Écart" | "Validée" | string;
  declaredCash: number;
  declaredCheques: number;
  declaredTotal: number;
  countedTotal: number;
  validatedTotal: number;
  payments: CashCollection[];
  discrepancyReason?: string;
  requiresManagerApproval?: boolean;
}

export interface CashReconciliationInput {
  routeId: string;
  expectedRevision: number;
  requestId: string;
  countedCash: number;
  reason?: string;
  payments: Array<{
    paymentId: string;
    countedAmount: number;
    chequeNumber?: string;
    allocations: InvoiceAllocation[];
  }>;
}

export interface EvidenceInput {
  latitude: number;
  longitude: number;
  accuracy?: number;
  photoData?: string;
  signatureData?: string;
  signerName?: string;
  comment?: string;
}

export interface StopCompletionPayload {
  requestId: string;
  routeId: string;
  routeRevision?: number;
  deliveryNote: string;
  outcome: DeliveryOutcome;
  items: DeliveryItemInput[];
  payment?: PaymentInput;
  evidence: EvidenceInput;
  failureReason?: string;
  failureComment?: string;
}

export interface PendingOperation {
  requestId: string;
  createdAt: string;
  attempts: number;
  payload: StopCompletionPayload;
}

export interface VehicleStockLine {
  itemCode: string;
  itemName?: string;
  quantity: number;
  uom?: string;
}

export interface VehicleActiveRoute {
  routeId: string;
  lifecycle: string;
  driver?: string;
  driverName?: string;
}

export interface VehicleStock {
  name: string;
  label: string;
  registration?: string;
  status?: string;
  active: boolean;
  warehouse?: string;
  missingWarehouse: boolean;
  totalQuantity: number;
  itemCount: number;
  lines: VehicleStockLine[];
  activeRoutes: VehicleActiveRoute[];
}

export type DriverCashMovementType = "Retour tournée" | "Encaissement" | "Remise" | "Avance" | "Ajustement" | string;

export interface DriverCashMovement {
  name: string;
  type: DriverCashMovementType;
  amount: number;
  balanceAfter: number;
  routeId?: string;
  reason?: string;
  date?: string;
}

export interface DriverCashBox {
  name: string;
  driver: string;
  driverName: string;
  balance: number;
  updatedAt?: string;
  active?: boolean;
  movements?: DriverCashMovement[];
}

export interface DriverCashAdjustmentInput {
  driver: string;
  type: "Remise" | "Avance" | "Ajustement";
  amount: number;
  reason: string;
  routeId?: string;
}

export interface DriverDashboardKpis {
  plannedStops: number;
  completedStops: number;
  deliveredStops: number;
  failedStops: number;
  remainingStops: number;
  plannedRoutes: number;
  amountCollected: number;
  amountToCollect: number;
}

export interface DriverDashboardCash {
  balance: number;
  declaredCash: number;
  declaredCheques: number;
  declaredTotal: number;
  status: "Sans encaissement" | "À contrôler" | "Écart" | "Validée" | string;
  updatedAt?: string | null;
  movements: DriverCashMovement[];
}

export interface DriverDashboardRoute {
  name: string;
  lifecycle: RouteLifecycle | string;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  vehicle?: string | null;
  vehicleLabel?: string | null;
  stopsTotal: number;
  stopsDone: number;
  stopsRemaining: number;
  collected: number;
  toCollect: number;
  cashStatus?: string;
}

export interface DriverDashboardNextStop {
  deliveryNote: string;
  routeId: string;
  sequence: number;
  customer?: string;
  customerName: string;
  address?: string | null;
  commune?: string | null;
  wilaya?: string | null;
  phone?: string | null;
  amountToCollect: number;
  status: string;
}

export interface DriverDashboardDay {
  date: string;
  plannedStops: number;
  deliveredStops: number;
  collected: number;
}

export interface DriverDashboardWeek {
  from: string;
  to: string;
  deliveredStops: number;
  plannedStops: number;
  collected: number;
  days: DriverDashboardDay[];
}

export interface DriverDashboardData {
  date: string;
  driver: {
    name?: string | null;
    label?: string | null;
    vehicle?: string | null;
  };
  kpis: DriverDashboardKpis;
  cash: DriverDashboardCash;
  routes: DriverDashboardRoute[];
  nextStop: DriverDashboardNextStop | null;
  week: DriverDashboardWeek;
}

export type ActivityTone = "danger" | "warning" | "info" | "success";

export interface ActivityAlert {
  id: string;
  tone: ActivityTone;
  title: string;
  detail: string;
  target?: string;
}

export interface ActivityNowItem {
  id: string;
  kind: "pick" | "load" | "return" | "route" | "cash" | string;
  title: string;
  detail: string;
  tone: ActivityTone;
  target?: string;
}

export interface ActivityPickList {
  name: string;
  modified?: string | null;
  salesOrderCount: number;
  remainingQty: number;
}

export interface ActivityPreparation {
  toPick: number;
  overdue: number;
  today: number;
  later: number;
  inProgressPickLists: number;
  remainingQty: number;
  shortageOrders: number;
  pickLists: ActivityPickList[];
}

export interface ActivityFulfillmentRoute {
  name: string;
  date?: string | null;
  lifecycle?: string;
  driverName?: string | null;
  vehicle?: string | null;
  vehicleLabel?: string | null;
  loadingStatus?: string;
}

export interface ActivityFulfillment {
  toLoad: number;
  loaded: number;
  returnsPending: number;
  toLoadRoutes: ActivityFulfillmentRoute[];
  returnRoutes: ActivityFulfillmentRoute[];
}

export interface ActivityLiveStop {
  deliveryNote: string;
  customer?: string;
  customerName: string;
  status: string;
  sequence: number;
  latitude?: number | null;
  longitude?: number | null;
}

export interface ActivityLiveRoute {
  name: string;
  date: string;
  lifecycle: RouteLifecycle;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  driver?: string | null;
  driverName?: string | null;
  vehicle?: string | null;
  vehicleLabel?: string | null;
  loadingStatus?: string;
  cashStatus?: string;
  depot?: RouteDepot | null;
  routing?: { geometry?: RouteGeometry | null } | null;
  stops: ActivityLiveStop[];
  doneStops: number;
  remainingStops: number;
  failedStops: number;
  nextStop?: { deliveryNote: string; customerName: string; status: string } | null;
}

export interface ActivityFleet {
  published: number;
  inProgress: number;
  returning: number;
  doneStops: number;
  remainingStops: number;
  failedStops: number;
  liveRoutes: ActivityLiveRoute[];
}

export interface ActivityPlanning {
  unassigned: number;
  overdue: number;
}

export interface ActivityDispatchNote {
  deliveryNote: string;
  customerName?: string | null;
  requestedDate?: string | null;
  lifecycle: string;
  planningStatus?: string;
  routeId?: string | null;
  routeDate?: string | null;
  routeLifecycle?: string | null;
  loadingStatus?: string | null;
}

export interface ActivityDispatch {
  ready: number;
  unassigned: number;
  waitingLoad: number;
  overdue: number;
  notes: ActivityDispatchNote[];
}

export interface ActivityStock {
  onRoute: number;
  loaded: number;
  empty: number;
  missingWarehouse: number;
}

export interface ActivityPayments {
  toControl: number;
  discrepancies: number;
  declaredToday: number;
  pendingPayments: number;
  driverCashTotal: number;
  driverCashBoxes: number;
}

export interface ActivityPipeline {
  toPrepare: number;
  toPlan: number;
  toDispatch: number;
  live: number;
  returning: number;
  cashier: number;
}

export interface ActivityDashboardData {
  date: string;
  role: DistributionRole | string;
  pipeline?: ActivityPipeline;
  preparation?: ActivityPreparation;
  fulfillment?: ActivityFulfillment;
  fleet?: ActivityFleet;
  planning?: ActivityPlanning;
  dispatch?: ActivityDispatch;
  stock?: ActivityStock;
  payments?: ActivityPayments;
  alerts?: ActivityAlert[];
  now?: ActivityNowItem[];
}
