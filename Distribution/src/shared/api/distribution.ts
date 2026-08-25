import { useFrappeGetCall, useFrappePostCall } from "frappe-react-sdk";
import type {
  AssignmentChange,
  DeliveryNoteAssignment,
  DistributionException,
  DistributionRoute,
  OrderChangeImpact,
  PlanningFilters,
  PlanningBoard,
  PublicTrackingData,
  RouteDraft,
  RouteOptimizationProposal,
  SaveRouteResult,
  StopCompletionPayload,
  StopCompletionResult,
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

export function useRouteDetails(routeId?: string) {
  return useFrappeGetCall<FrappeMessage<DistributionRoute>>(
    "log.api.distribution.get_route_details",
    routeId ? { route_id: routeId } : undefined,
    routeId ? `distribution-route-details-${routeId}` : "distribution-route-details",
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
    startRoute: async (routeId: string) => (await start.call({ route_id: routeId })).message,
    finishRoute: async (routeId: string) => (await finish.call({ route_id: routeId })).message,
    completeStop: async (payload: StopCompletionPayload) => (await complete.call({ payload })).message,
    saving: save.loading || publish.loading || start.loading || finish.loading || complete.loading
      || schedule.loading || reassign.loading || acknowledge.loading || impact.loading || reprepare.loading || resolveException.loading
      || generateQr.loading,
    routing: calculateItinerary.loading || proposeOptimization.loading || applyOptimization.loading,
  };
}

export type { DistributionException };
