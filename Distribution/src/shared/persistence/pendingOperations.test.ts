import { beforeEach, describe, expect, it } from "vitest";
import { confirmOperation, markOperationAttempt, queueOperation, readPendingOperations } from "@/shared/persistence/pendingOperations";
import type { StopCompletionPayload } from "@/shared/types/distribution";

const payload: StopCompletionPayload = {
  requestId: "request-1",
  routeId: "LIV-1",
  deliveryNote: "DN-1",
  outcome: "delivered",
  items: [],
  evidence: { latitude: 36.75, longitude: 3.04, photoData: "data:image/jpeg;base64,AA==" },
};

describe("pendingOperations", () => {
  beforeEach(() => localStorage.clear());
  it("conserve une opération jusqu'à confirmation du serveur", () => {
    queueOperation(payload);
    expect(readPendingOperations()).toHaveLength(1);
    markOperationAttempt(payload.requestId);
    expect(readPendingOperations()[0].attempts).toBe(1);
    confirmOperation(payload.requestId);
    expect(readPendingOperations()).toEqual([]);
  });
  it("ne duplique pas une même requête", () => {
    queueOperation(payload);
    queueOperation(payload);
    expect(readPendingOperations()).toHaveLength(1);
  });
});
