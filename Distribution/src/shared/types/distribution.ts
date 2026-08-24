export type DistributionRole =
  | "preparateur"
  | "planificateur"
  | "livreur"
  | "responsable"
  | "none";

export interface DistributionUser {
  name: string;
  fullName: string;
  email: string;
  role: DistributionRole;
}

export type RouteLifecycle = "Brouillon" | "Publiée" | "En cours" | "Terminée" | "Annulée";

export interface RouteStop {
  deliveryNote: string;
  salesOrder?: string;
  customer: string;
  customerName: string;
  commune?: string;
  wilaya?: string;
  latitude?: number;
  longitude?: number;
  totalQuantity: number;
  amountToCollect: number;
  status: string;
  planningStatus: PlanningStatus;
  requestedDate?: string;
  plannedDate?: string;
  routeId?: string;
  planningAlert?: string;
  sequence: number;
  address?: string;
  phone?: string;
  instructions?: string;
  items?: RouteStopItem[];
}

export interface RouteStopItem {
  name: string;
  itemCode: string;
  itemName: string;
  quantity: number;
  deliveredQuantity: number;
  remainingQuantity: number;
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
  vehicleCapacity?: number;
  totalQuantity: number;
  totalAmount: number;
  stops: RouteStop[];
  alerts: string[];
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
  | "À revalider"
  | "À repréparer"
  | "En cours"
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
  payment?: string;
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
