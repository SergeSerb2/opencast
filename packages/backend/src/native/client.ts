import { createInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { EventEmitter } from "node:events";
import {
  RpcErrorCode,
  type BackendForNativeMethods,
  type NativeEvents,
  type NativeMethod,
  type NativeParams,
  type NativeResult,
  type RpcMessage,
} from "@surgecast/protocol";
import { RpcError, toRpcErrorObject } from "../util/errors";
import { createLogger } from "../util/log";

const log = createLogger("native");

export type NativeEventTopic = keyof NativeEvents & string;

/** What the rest of the backend sees: call native methods, listen to native events. */
export interface NativeApi {
  readonly available: boolean;
  call<M extends NativeMethod>(method: M, params: NativeParams<M>, options?: { timeoutMs?: number }): Promise<NativeResult<M>>;
  on<T extends NativeEventTopic>(topic: T, listener: (payload: NativeEvents[T]) => void): () => void;
  /** Handle requests the native host sends to the backend. */
  serve<M extends keyof BackendForNativeMethods & string>(
    method: M,
    handler: (params: BackendForNativeMethods[M]["params"]) => Promise<BackendForNativeMethods[M]["result"]> | BackendForNativeMethods[M]["result"],
  ): void;
  /** Send a notification to native (rarely needed). */
  notify(method: string, params?: unknown): void;
}

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  timer: NodeJS.Timeout;
}

/**
 * JSON-RPC over the process's stdin/stdout, one JSON object per line.
 * Nothing else may write to stdout (see main.ts, which redirects console.*).
 */
export class StdioNativeClient implements NativeApi {
  readonly available = true;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly emitter = new EventEmitter();
  private readonly handlers = new Map<string, (params: unknown) => unknown>();

  constructor(
    private readonly input: Readable = process.stdin,
    private readonly output: Writable = process.stdout,
  ) {
    this.emitter.setMaxListeners(0);
    const rl = createInterface({ input: this.input, crlfDelay: Infinity });
    rl.on("line", (line) => this.onLine(line));
    rl.on("close", () => {
      log.warn("native stdin closed; exiting");
      for (const p of this.pending.values()) p.reject(new RpcError(RpcErrorCode.NativeUnavailable, "Native host disconnected"));
      process.exit(0);
    });
  }

  call<M extends NativeMethod>(method: M, params: NativeParams<M>, options?: { timeoutMs?: number }): Promise<NativeResult<M>> {
    const id = this.nextId++;
    const timeoutMs = options?.timeoutMs ?? 30_000;
    return new Promise<NativeResult<M>>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new RpcError(RpcErrorCode.InternalError, `Native call timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.write({ jsonrpc: "2.0", id, method, params: params ?? undefined });
    });
  }

  on<T extends NativeEventTopic>(topic: T, listener: (payload: NativeEvents[T]) => void): () => void {
    this.emitter.on(topic, listener);
    return () => this.emitter.off(topic, listener);
  }

  serve<M extends keyof BackendForNativeMethods & string>(
    method: M,
    handler: (params: BackendForNativeMethods[M]["params"]) => unknown,
  ): void {
    this.handlers.set(method, handler as (params: unknown) => unknown);
  }

  notify(method: string, params?: unknown): void {
    this.write({ jsonrpc: "2.0", method, params });
  }

  /** Used once at startup: `backend.ready`. */
  write(message: unknown): void {
    this.output.write(JSON.stringify(message) + "\n");
  }

  private onLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: RpcMessage;
    try {
      msg = JSON.parse(trimmed) as RpcMessage;
    } catch {
      log.warn("invalid JSON from native", trimmed.slice(0, 200));
      return;
    }
    if ("method" in msg) {
      const id = "id" in msg ? msg.id : undefined;
      if (id === undefined || id === null) {
        this.emitter.emit(msg.method, msg.params);
        return;
      }
      void this.answer(id, msg.method, msg.params);
      return;
    }
    const pending = this.pending.get(Number(msg.id));
    if (!pending) return;
    this.pending.delete(Number(msg.id));
    clearTimeout(pending.timer);
    if ("error" in msg) pending.reject(new RpcError(msg.error.code, msg.error.message, msg.error.data));
    else pending.resolve(msg.result);
  }

  private async answer(id: string | number, method: string, params: unknown): Promise<void> {
    const handler = this.handlers.get(method);
    if (!handler) {
      this.write({ jsonrpc: "2.0", id, error: { code: RpcErrorCode.MethodNotFound, message: `Method not found: ${method}` } });
      return;
    }
    try {
      const result = await handler(params);
      this.write({ jsonrpc: "2.0", id, result: result ?? null });
    } catch (error) {
      this.write({ jsonrpc: "2.0", id, error: toRpcErrorObject(error) });
    }
  }
}
