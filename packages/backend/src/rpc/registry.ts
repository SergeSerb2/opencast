import { RpcErrorCode } from "@opencast/protocol";
import { RpcError } from "../util/errors";

export interface MethodSpec {
  params: unknown;
  result: unknown;
}

/** Who is calling. `window` is set for frontend WebSocket connections. */
export interface CallContext {
  connectionId: string;
  window?: string;
  /** Aborted when the connection closes or the caller cancels. */
  signal: AbortSignal;
}

type Handler<P, R> = (params: P, ctx: CallContext) => R | Promise<R>;

/**
 * Method table shared by every inbound transport (WebSocket for the frontend,
 * stdio for native). Handlers are registered by services at startup.
 */
export class RpcRegistry<Methods extends { [K in keyof Methods]: MethodSpec }> {
  private readonly handlers = new Map<string, Handler<unknown, unknown>>();

  handle<M extends keyof Methods & string>(
    method: M,
    handler: Handler<Methods[M]["params"], Methods[M]["result"]>,
  ): void {
    if (this.handlers.has(method)) throw new Error(`RPC method registered twice: ${method}`);
    this.handlers.set(method, handler as Handler<unknown, unknown>);
  }

  /** Register many handlers at once: `rpc.handleAll({ "notes.list": ..., ... })`. */
  handleAll(table: { [M in keyof Methods & string]?: Handler<Methods[M]["params"], Methods[M]["result"]> }): void {
    for (const [method, handler] of Object.entries(table)) {
      if (handler) this.handle(method as keyof Methods & string, handler as never);
    }
  }

  has(method: string): boolean {
    return this.handlers.has(method);
  }

  methods(): string[] {
    return [...this.handlers.keys()].sort();
  }

  async invoke(method: string, params: unknown, ctx: CallContext): Promise<unknown> {
    const handler = this.handlers.get(method);
    if (!handler) throw new RpcError(RpcErrorCode.MethodNotFound, `Method not found: ${method}`);
    if (params !== undefined && params !== null && (typeof params !== "object" || Array.isArray(params)))
      throw RpcError.invalidParams("Expected named parameters");
    return handler(params ?? {}, ctx);
  }
}
