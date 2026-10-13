import { RpcErrorCode, type RpcErrorObject } from "@opencast/protocol";

/** Frontend-only code: the WebSocket dropped while the request was in flight. */
export const CONNECTION_LOST = -32090;
/** Frontend-only code: no answer within the request timeout. */
export const REQUEST_TIMEOUT = -32091;

export class RpcError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(error: RpcErrorObject) {
    super(error.message);
    this.name = "RpcError";
    this.code = error.code;
    this.data = error.data;
  }

  get isCancelled(): boolean {
    return this.code === RpcErrorCode.Cancelled;
  }
}

export function cancelledError(method: string): RpcError {
  return new RpcError({ code: RpcErrorCode.Cancelled, message: `${method} was cancelled` });
}

export function isCancelled(error: unknown): boolean {
  return (error instanceof RpcError && error.isCancelled) || (error instanceof DOMException && error.name === "AbortError");
}

/** Human-readable message for toasts. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Something went wrong";
}
