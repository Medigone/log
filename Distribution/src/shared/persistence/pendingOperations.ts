import type { PendingOperation, StopCompletionPayload } from "@/shared/types/distribution";

const STORAGE_KEY = "intrapro-distribution.pending-operations.v1";

export function readPendingOperations(): PendingOperation[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(value) ? value.filter(isPendingOperation) : [];
  } catch {
    return [];
  }
}

function isPendingOperation(value: unknown): value is PendingOperation {
  if (!value || typeof value !== "object") return false;
  const operation = value as Partial<PendingOperation>;
  return typeof operation.requestId === "string" && Boolean(operation.payload);
}

function write(operations: PendingOperation[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(operations));
}

export function queueOperation(payload: StopCompletionPayload): PendingOperation {
  const operations = readPendingOperations();
  const existing = operations.find((operation) => operation.requestId === payload.requestId);
  if (existing) return existing;
  const operation: PendingOperation = {
    requestId: payload.requestId,
    createdAt: new Date().toISOString(),
    attempts: 0,
    payload,
  };
  write([...operations, operation]);
  return operation;
}

export function markOperationAttempt(requestId: string) {
  write(readPendingOperations().map((operation) => operation.requestId === requestId
    ? { ...operation, attempts: operation.attempts + 1 }
    : operation));
}

export function confirmOperation(requestId: string) {
  write(readPendingOperations().filter((operation) => operation.requestId !== requestId));
}

export function clearPendingOperations(): PendingOperation[] {
  const operations = readPendingOperations();
  write([]);
  return operations;
}
