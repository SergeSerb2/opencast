import { randomUUID } from "node:crypto";

export function newId(): string {
  return randomUUID();
}

let lastTimestamp = 0;

/**
 * Monotonic millisecond timestamp. Two writes in the same millisecond still get
 * strictly increasing `updatedAt` values, which last-writer-wins sync relies on.
 */
export function monotonicNow(): number {
  const now = Date.now();
  lastTimestamp = now > lastTimestamp ? now : lastTimestamp + 1;
  return lastTimestamp;
}

/** Feed a timestamp observed from another device so local clocks never go backwards relative to it. */
export function observeTimestamp(ts: number): void {
  if (ts > lastTimestamp) lastTimestamp = ts;
}
