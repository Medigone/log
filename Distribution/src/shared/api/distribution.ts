import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";
import type {
  AssignmentChange,
  CashReconciliation,
  CashReconciliationInput,
  DeliveryNoteAssignment,
  DistributionException,
  DistributionRoute,
  DriverCashAdjustmentInput,
  DriverCashBox,
  DriverDashboardData,
  OrderChangeImpact,
  PlanningFilters,
  PlanningBoard,
  PublicTrackingData,
  RouteDraft,
  RouteReturnInput,
  RouteOptimizationProposal,
  SaveRouteResult,
  StopCompletionPayload,
  StopCompletionResult,
  VehicleStock,
} from "@/shared/types/distribution";

interface FrappeMessage<T> {
  message: T;
}

export function apiErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const value = error as Record<string, unknown>;
    const messages = [value.message, value.httpStatusText, value.exception]
      .filter((item): item is string => typeof item === "string" && item.length > 0);
    if (messages.length) return messages[0];
  }
  return "Une erreur inattendue est survenue.";
}

export function usePlanningBoard(dateFrom: string, dateTo = dateFrom, filters: PlanningFilters = {}) {
  const filterKey = JSON.stringify(filters);
  return useFrappeGetCall<FrappeMessage<PlanningBoard>>(
    "log.api.distribution.get_planning_board",
    { date_from: dateFrom, date_to: dateTo, filters: filterKey },
    `distribution-planning-${dateFrom}-${dateTo}-${filterKey}`,
  );
}

export function useDriverRoutes(date: string) {
  return useFrappeGetCall<FrappeMessage<DistributionRoute[]>>(
    "log.api.distribution.get_driver_routes",
    { date },
    `distribution-driver-routes-${date}`,
  );
}

export function useDriverDashboard(date: string) {
  return useFrappeGetCall<FrappeMessage<DriverDashboardData>>(
    "log.api.distribution.get_driver_dashboard",
    { date },
    `distribution-driver-dashboard-${date}`,
  );
}

export function useReturnRoutes(dateFrom: string, dateTo: string) {
  return useFrappeGetCall<FrappeMessage<DistributionRoute[]>>(
    "log.api.distribution.get_return_routes",
    { date_from: dateFrom, date_to: dateTo },
    `distribution-returns-${dateFrom}-${dateTo}`,
  );
}

export function useCashierRoutes(dateFrom: string, dateTo: string, status = "") {
  return useFrappeGetCall<FrappeMessage<DistributionRoute[]>>(
    "log.api.distribution.get_cashier_routes",
    { date_from: dateFrom, date_to: dateTo, status },
    `distribution-cashier-${dateFrom}-${dateTo}-${status}`,
  );
}

export function useCashierReconciliation(routeId?: string) {
  return useFrappeGetCall<FrappeMessage<CashReconciliation>>(
    "log.api.distribution.get_cashier_reconciliation",
    routeId ? { route_id: routeId } : undefined,
    routeId ? `distribution-cashier-route-${routeId}` : null,
  );
}

export function useVehicleStocks() {
  return useFrappeGetCall<FrappeMessage<VehicleStock[]>>(
    "log.api.distribution.get_vehicle_stocks",
    {},
    "distribution-vehicle-stocks",
    {
      refreshInterval: 10_000,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
      revalidateOnFocus: true,
    },
  );
}

export function useDriverCashBoxes() {
  return useFrappeGetCall<FrappeMessage<DriverCashBox[]>>(
    "log.api.distribution.get_driver_cash_boxes",
    {},
    "distribution-driver-cash-boxes",
  );
}

export function useDriverCashBox(driver?: string) {
  return useFrappeGetCall<FrappeMessage<DriverCashBox>>(
    "log.api.distribution.get_driver_cash_box",
    driver ? { livreur: driver } : undefined,
    driver ? `distribution-driver-cash-${driver}` : null,
  );
}

export function useRouteDetails(routeId?: string) {
  return useFrappeGetCall<FrappeMessage<DistributionRoute>>(
    "log.api.distribution.get_route_details",
    routeId ? { route_id: routeId } : undefined,
    routeId ? `distribution-route-details-${routeId}` : null,
    {
      refreshInterval: 10_000,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
      revalidateOnFocus: true,
    },
  );
}

export function useDriverRoute(routeId?: string) {
  return useFrappeGetCall<FrappeMessage<DistributionRoute | null>>(
    "log.api.distribution.get_driver_route",
    routeId ? { route_id: routeId } : undefined,
    routeId ? `distribution-driver-${routeId}` : "distribution-driver-current",
  );
}

export function usePublicTracking(deliveryNote: string) {
  return useFrappeGetCall<FrappeMessage<PublicTrackingData>>(
    "log.delivery_note_ops.get_public_bl_data",
    { bl_id: deliveryNote },
    `distribution-public-${deliveryNote}`,
  );
}

export function useDistributionMutations() {
  const save = useFrappePostCall<FrappeMessage<SaveRouteResult>>("log.api.distribution.save_route");
  const publish = useFrappePostCall<FrappeMessage<SaveRouteResult>>("log.api.distribution.publish_route");
  const start = useFrappePostCall<FrappeMessage<DistributionRoute>>("log.api.distribution.start_route");
  const finish = useFrappePostCall<FrappeMessage<DistributionRoute>>("log.api.distribution.finish_route");
  const complete = useFrappePostCall<FrappeMessage<StopCompletionResult>>(
    "log.api.distribution.complete_delivery_stop",
  );
  const reassign = useFrappePostCall<FrappeMessage<{ assignment: DeliveryNoteAssignment; route: DistributionRoute; sourceRoute?: DistributionRoute; warning?: string }>>(
    "log.api.distribution.reassign_delivery_note",
  );
  const schedule = useFrappePostCall<FrappeMessage<{ assignment: DeliveryNoteAssignment; route: DistributionRoute; warning?: string }>>(
    "log.api.distribution.schedule_delivery_note",
  );
  const acknowledge = useFrappePostCall<FrappeMessage<DistributionRoute>>(
    "log.api.distribution.acknowledge_route",
  );
  const impact = useFrappePostCall<FrappeMessage<OrderChangeImpact>>(
    "log.api.distribution.get_repreparation_impact",
  );
  const reprepare = useFrappePostCall<FrappeMessage<{ impact: OrderChangeImpact; pickList: string }>>(
    "log.api.distribution.reprepare_changed_order",
  );
  const resolveException = useFrappePostCall<FrappeMessage<{ name: string; status: string }>>(
    "log.api.distribution.resolve_distribution_exception",
  );
  const generateQr = useFrappePostCall<FrappeMessage<{ success: boolean; file_url: string; url?: string }>>(
    "log.delivery_note_ops.generate_qr_code",
  );
  const calculateItinerary = useFrappePostCall<FrappeMessage<DistributionRoute>>(
    "log.api.distribution.calculate_route_itinerary",
  );
  const proposeOptimization = useFrappePostCall<FrappeMessage<RouteOptimizationProposal>>(
    "log.api.distribution.propose_route_optimization",
  );
  const applyOptimization = useFrappePostCall<FrappeMessage<DistributionRoute>>(
    "log.api.distribution.apply_route_optimization",
  );
  const declareReturn = useFrappePostCall<FrappeMessage<DistributionRoute>>(
    "log.api.distribution.declare_route_return",
  );
  const confirmReturn = useFrappePostCall<FrappeMessage<{ success: boolean; route: DistributionRoute; differences?: Array<{ lineName: string; itemCode: string; expected: number; counted: number }> }>>(
    "log.api.distribution.confirm_route_return",
  );
  const validateCash = useFrappePostCall<FrappeMessage<{ reconciliation: CashReconciliation; route: DistributionRoute }>>(
    "log.api.distribution.validate_cash_reconciliation",
  );
  const resolveCash = useFrappePostCall<FrappeMessage<{ reconciliation: CashReconciliation; route: DistributionRoute }>>(
    "log.api.distribution.resolve_cash_discrepancy",
  );
  const retryInvoice = useFrappePostCall<FrappeMessage<{ salesInvoice?: string; invoiceStatus: string; route: DistributionRoute }>>(
    "log.api.distribution.retry_delivery_invoice",
  );
  const adjustCash = useFrappePostCall<FrappeMessage<DriverCashBox>>(
    "log.api.distribution.post_driver_cash_adjustment",
  );

  return {
    saveRoute: async (route: RouteDraft) => (await save.call({ route })).message,
    publishRoute: async (routeId: string, expectedRevision?: number) =>
      (await publish.call({ route_id: routeId, expected_revision: expectedRevision })).message,
    scheduleDeliveryNote: async (payload: AssignmentChange) => (await schedule.call({ payload })).message,
    reassignDeliveryNote: async (payload: AssignmentChange) => (await reassign.call({ payload })).message,
    acknowledgeRoute: async (routeId: string, revision: number) =>
      (await acknowledge.call({ route_id: routeId, revision })).message,
    getRepreparationImpact: async (salesOrder: string) =>
      (await impact.call({ sales_order: salesOrder })).message,
    reprepareChangedOrder: async (salesOrder: string, expectedRevision: number) =>
      (await reprepare.call({ sales_order: salesOrder, expected_revision: expectedRevision })).message,
    resolveException: async (payload: { exceptionId: string; action: "maintain" | "reschedule" | "return_reload"; resolution: string }) =>
      (await resolveException.call({ payload })).message,
    generateQrCode: async (deliveryNote: string) => (await generateQr.call({ docname: deliveryNote })).message,
    calculateRouteItinerary: async (routeId: string, expectedRevision: number) =>
      (await calculateItinerary.call({ route_id: routeId, expected_revision: expectedRevision })).message,
    proposeRouteOptimization: async (routeId: string, expectedRevision: number) =>
      (await proposeOptimization.call({ route_id: routeId, expected_revision: expectedRevision })).message,
    applyRouteOptimization: async (routeId: string, orderedDeliveryNotes: string[], expectedRevision: number) =>
      (await applyOptimization.call({
        route_id: routeId,
        ordered_delivery_notes: orderedDeliveryNotes,
        expected_revision: expectedRevision,
      })).message,
    startRoute: async (routeId: string, expectedRevision?: number) => (await start.call({ route_id: routeId, expected_revision: expectedRevision, request_id: crypto.randomUUID() })).message,
    finishRoute: async (routeId: string) => (await finish.call({ route_id: routeId })).message,
    completeStop: async (payload: StopCompletionPayload) => (await complete.call({ payload })).message,
    declareRouteReturn: async (routeId: string, expectedRevision: number) => (await declareReturn.call({ route_id: routeId, expected_revision: expectedRevision, request_id: crypto.randomUUID() })).message,
    confirmRouteReturn: async (payload: RouteReturnInput) => (await confirmReturn.call({ payload })).message,
    validateCashReconciliation: async (payload: CashReconciliationInput) => (await validateCash.call({ payload })).message,
    resolveCashDiscrepancy: async (payload: CashReconciliationInput) => (await resolveCash.call({ payload })).message,
    retryDeliveryInvoice: async (deliveryNote: string) => (await retryInvoice.call({ delivery_note: deliveryNote })).message,
    postDriverCashAdjustment: async (payload: DriverCashAdjustmentInput) => (await adjustCash.call({ payload })).message,
    saving: save.loading || publish.loading || start.loading || finish.loading || complete.loading
      || schedule.loading || reassign.loading || acknowledge.loading || impact.loading || reprepare.loading || resolveException.loading
      || generateQr.loading,
    fulfillment: declareReturn.loading || confirmReturn.loading,
    cashier: validateCash.loading || resolveCash.loading,
    driverCash: adjustCash.loading,
    accounting: retryInvoice.loading,
    routing: calculateItinerary.loading || proposeOptimization.loading || applyOptimization.loading,
  };
}

export type { DistributionException };
