import { RpcErrorCode } from "@opencast/protocol";

/** An error that crosses an RPC boundary with a JSON-RPC code. */
export class RpcError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "RpcError";
    this.code = code;
    this.data = data;
  }

  static notFound(what: string): RpcError {
    return new RpcError(RpcErrorCode.NotFound, `${what} not found`);
  }

  static invalidParams(message: string): RpcError {
    return new RpcError(RpcErrorCode.InvalidParams, message);
  }

  static upstream(message: string, data?: unknown): RpcError {
    return new RpcError(RpcErrorCode.Upstream, message, data);
  }
}

export function toRpcErrorObject(error: unknown): { code: number; message: string; data?: unknown } {
  if (error instanceof RpcError) return { code: error.code, message: error.message, data: error.data };
  if (error && typeof error === "object" && "code" in error && typeof (error as { code: unknown }).code === "number") {
    const e = error as { code: number; message?: string; data?: unknown };
    return { code: e.code, message: e.message ?? "Error", data: e.data };
  }
  const message = error instanceof Error ? error.message : String(error);
  return { code: RpcErrorCode.InternalError, message };
}
