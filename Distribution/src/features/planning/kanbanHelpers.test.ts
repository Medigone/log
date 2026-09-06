import { describe, it, expect } from "vitest";
import {
  BACKLOG_COLUMN_ID,
  buildKanbanValue,
  canDeleteDraftRoute,
  columnLoad,
  driverLoad,
  isItemDraggable,
  listActiveDrivers,
  newRouteColumnId,
  notesToMoveOnDrag,
  parseNewRouteColumnId,
  parseRouteColumnId,
  preferNewRouteCollisions,
  resourceCapacity,
  routeColumnId,
  type KanbanBLItem,
} from "./kanbanHelpers";
import type {
  DeliveryNoteAssignment,
  DistributionRoute,
  PlanningResource,
} from "@/shared/types/distribution";

function makeAssignment(overrides: Partial<DeliveryNoteAssignment> = {}): DeliveryNoteAssignment {
  return {
    deliveryNote: "DN-001",
    customer: "CUST-1",
    customerName: "Client A",
    totalQuantity: 10,
    amountCollected: 0,
    amountToCollect: 100,
    payments: [],
    invoiceStatus: "Non créée",
    sequence: 1,
    planningStatus: "Non planifié",
    routeRevision: 0,
    status: "Préparé",
    customerGpsStatus: "known",
    requiresCustomerGeolocation: false,
    ...overrides,
  } as DeliveryNoteAssignment;
}

function makeRoute(overrides: Partial<DistributionRoute> = {}): DistributionRoute {
  return {
    name: "LIV-001",
    date: "2026-09-03",
    lifecycle: "Brouillon",
    revision: 1,
    publishedRevision: 0,
    acknowledgedRevision: 0,
    acknowledged: false,
    needsReview: false,
    totalQuantity: 10,
    totalCollected: 0,
    totalAmount: 100,
    stops: [],
    routing: { status: "not_calculated", provider: "openrouteservice", profile: "driving-car", optimizationEnabled: false },
    stock: {} as DistributionRoute["stock"],
    cash: {} as DistributionRoute["cash"],
    alerts: [],
    driver: "DRV-1",
    driverName: "Ali",
    vehicle: "VEH-1",
    plannedStart: "2026-09-03T08:00:00",
    plannedEnd: "2026-09-03T12:00:00",
    ...overrides,
  } as DistributionRoute;
}

const drivers: PlanningResource[] = [
  { name: "DRV-1", label: "Ali", active: true },
  { name: "DRV-2", label: "Bilal", active: true },
  { name: "DRV-3", label: "Karim", active: false },
];

describe("buildKanbanValue", () => {
  it("places unassigned items in backlog", () => {
    const assignments = [makeAssignment({ deliveryNote: "DN-001" })];
    const { columns, items } = buildKanbanValue(assignments, [], drivers);
    expect(columns[0].id).toBe(BACKLOG_COLUMN_ID);
    expect(items[0].columnId).toBe(BACKLOG_COLUMN_ID);
  });

  it("registers a new-route droppable for every active driver even without a route", () => {
    const { columns } = buildKanbanValue([], [], drivers);
    expect(columns.map((column) => column.id)).toEqual([
      BACKLOG_COLUMN_ID,
      newRouteColumnId("DRV-1"),
      newRouteColumnId("DRV-2"),
    ]);
  });

  it("places assigned items in their route column", () => {
    const route = makeRoute({ name: "LIV-001", driver: "DRV-2" });
    const assignments = [makeAssignment({ deliveryNote: "DN-001", route: "LIV-001" })];
    const { items, columns } = buildKanbanValue(assignments, [route], drivers);
    expect(items[0].columnId).toBe(routeColumnId("LIV-001"));
    expect(columns.map((column) => column.id)).toContain(routeColumnId("LIV-001"));
  });

  it("keeps two routes of the same driver as separate droppables", () => {
    const a = makeRoute({ name: "LIV-A", driver: "DRV-1", plannedStart: "2026-09-03T08:00:00" });
    const b = makeRoute({ name: "LIV-B", driver: "DRV-1", plannedStart: "2026-09-03T14:00:00" });
    const assignments = [
      makeAssignment({ deliveryNote: "DN-A", route: "LIV-A" }),
      makeAssignment({ deliveryNote: "DN-B", route: "LIV-B" }),
    ];
    const { items } = buildKanbanValue(assignments, [a, b], drivers);
    expect(items[0].columnId).toBe(routeColumnId("LIV-A"));
    expect(items[1].columnId).toBe(routeColumnId("LIV-B"));
  });
});

describe("column ids", () => {
  it("parses route and new-route columns and ignores backlog", () => {
    expect(parseRouteColumnId(routeColumnId("LIV-001"))).toBe("LIV-001");
    expect(parseRouteColumnId(BACKLOG_COLUMN_ID)).toBeNull();
    expect(parseNewRouteColumnId(newRouteColumnId("DRV-1"))).toBe("DRV-1");
    expect(parseNewRouteColumnId(BACKLOG_COLUMN_ID)).toBeNull();
  });
});

describe("preferNewRouteCollisions", () => {
  it("keeps the new-route droppable when the pointer also hits a nearby route", () => {
    expect(
      preferNewRouteCollisions([
        { id: routeColumnId("LIV-001") },
        { id: newRouteColumnId("DRV-1") },
        { id: "DN-001" },
      ]),
    ).toEqual([{ id: newRouteColumnId("DRV-1") }]);
  });

  it("leaves collisions unchanged when no new-route zone is hit", () => {
    const hits = [{ id: routeColumnId("LIV-001") }, { id: "DN-001" }];
    expect(preferNewRouteCollisions(hits)).toEqual(hits);
  });
});

describe("listActiveDrivers", () => {
  it("omits inactive drivers and sorts by label", () => {
    expect(listActiveDrivers(drivers).map((driver) => driver.name)).toEqual(["DRV-1", "DRV-2"]);
  });
});

describe("resourceCapacity", () => {
  it("uses the vehicle capacity when the API exposes it", () => {
    expect(
      resourceCapacity(
        { name: "DRV-1", label: "Ali", active: true, vehicle: "VEH-1" },
        [{ name: "VEH-1", label: "Camion", active: true, capacity: 40 }],
      ),
    ).toBe(40);
  });

  it("does not invent a default when capacity is missing", () => {
    expect(resourceCapacity({ name: "DRV-1", label: "Ali", active: true, vehicle: "VEH-1" }, [{ name: "VEH-1", label: "Camion", active: true }])).toBeUndefined();
    expect(driverLoad([], undefined).pct).toBeUndefined();
  });
});

describe("columnLoad", () => {
  it("counts BLs and sums articles", () => {
    expect(
      columnLoad([
        { id: "DN-1", columnId: routeColumnId("LIV-001"), assignment: makeAssignment({ totalQuantity: 12 }) },
        { id: "DN-2", columnId: routeColumnId("LIV-001"), assignment: makeAssignment({ deliveryNote: "DN-2", totalQuantity: 24 }) },
      ]),
    ).toEqual({ blCount: 2, articleCount: 36 });
  });

  it("is zero when the column is empty", () => {
    expect(columnLoad([])).toEqual({ blCount: 0, articleCount: 0 });
  });
});

describe("canDeleteDraftRoute", () => {
  it("autorise seulement un brouillon sans arrêt", () => {
    expect(canDeleteDraftRoute(makeRoute({ lifecycle: "Brouillon", stops: [] }))).toBe(true);
    expect(canDeleteDraftRoute(makeRoute({ lifecycle: "Publiée", stops: [] }))).toBe(false);
    expect(
      canDeleteDraftRoute(
        makeRoute({ lifecycle: "Brouillon", stops: [{ deliveryNote: "DN-1" }] as DistributionRoute["stops"] }),
      ),
    ).toBe(false);
  });
});

describe("isItemDraggable", () => {
  it("backlog items are draggable", () => {
    const item: KanbanBLItem = {
      id: "DN-001",
      columnId: BACKLOG_COLUMN_ID,
      assignment: makeAssignment(),
    };
    expect(isItemDraggable(item, [])).toBe(true);
  });

  it("items in draft routes are draggable", () => {
    const route = makeRoute({ lifecycle: "Brouillon" });
    const item: KanbanBLItem = {
      id: "DN-001",
      columnId: routeColumnId("LIV-001"),
      assignment: makeAssignment({ route: "LIV-001" }),
    };
    expect(isItemDraggable(item, [route])).toBe(true);
  });

  it("items in published routes are not draggable", () => {
    const route = makeRoute({ lifecycle: "Publiée" });
    const item: KanbanBLItem = {
      id: "DN-001",
      columnId: routeColumnId("LIV-001"),
      assignment: makeAssignment({ route: "LIV-001" }),
    };
    expect(isItemDraggable(item, [route])).toBe(false);
  });
});

describe("notesToMoveOnDrag", () => {
  it("returns only the dragged BL when nothing else is selected", () => {
    expect(notesToMoveOnDrag("DN-1", new Set(), ["DN-1", "DN-2"])).toEqual(["DN-1"]);
    expect(notesToMoveOnDrag("DN-1", new Set(["DN-1"]), ["DN-1", "DN-2"])).toEqual(["DN-1"]);
  });

  it("returns the whole selection when dragging one selected BL", () => {
    expect(notesToMoveOnDrag("DN-2", new Set(["DN-1", "DN-2", "DN-3"]), ["DN-1", "DN-2", "DN-3"])).toEqual([
      "DN-1",
      "DN-2",
      "DN-3",
    ]);
  });

  it("ignores the selection when dragging an unselected BL", () => {
    expect(notesToMoveOnDrag("DN-9", new Set(["DN-1", "DN-2"]), ["DN-1", "DN-2", "DN-9"])).toEqual(["DN-9"]);
  });
});
