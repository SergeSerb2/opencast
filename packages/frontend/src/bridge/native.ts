import { RpcErrorCode, type NativeEvents, type NativeMethod, type NativeParams, type NativeResult, type RpcErrorObject } from "@surgecast/protocol";
import { Emitter } from "./emitter";
import { RpcError } from "./errors";
import { getEnv } from "./env";
import { browserNativeCall } from "./native-mock";

export type NativeCallArgs<M extends NativeMethod> = [NativeParams<M>] extends [void] ? [params?: undefined] : [params: NativeParams<M>];

/** Receiver the Swift host calls through `evaluateJavaScript`. */
export interface NativeReceiver {
  emit<T extends keyof NativeEvents>(topic: T, payload: NativeEvents[T]): void;
  on<T extends keyof NativeEvents>(topic: T, fn: (payload: NativeEvents[T]) => void): () => void;
}

declare global {
  interface Window {
    __surgecastNative?: NativeReceiver;
  }
}

const events = new Emitter<NativeEvents>();

/**
 * Install `window.__surgecastNative` as early as possible: events the host
 * emits before it exists are lost. Safe to call more than once.
 */
export function installNativeReceiver(): NativeReceiver {
  if (!window.__surgecastNative) {
    window.__surgecastNative = {
      emit: (topic, payload) => events.emit(topic, payload),
      on: (topic, fn) => events.on(topic, fn),
    };
  }
  return window.__surgecastNative;
}

function isErrorReply(value: unknown): value is { error: RpcErrorObject } {
  return typeof value === "object" && value !== null && "error" in value && typeof (value as { error: unknown }).error === "object";
}

export const native = {
  /** True inside the Swift host; false in a plain browser (calls go to the browser fallback). */
  get available(): boolean {
    return getEnv().native;
  },

  async call<M extends NativeMethod>(method: M, ...args: NativeCallArgs<M>): Promise<NativeResult<M>> {
    const params = args[0] as NativeParams<M> | undefined;
    const handler = window.webkit?.messageHandlers?.native;
    if (!handler) return browserNativeCall(method, params, events);
    let reply: unknown;
    try {
      reply = await handler.postMessage(params === undefined ? { method } : { method, params });
    } catch (error) {
      throw new RpcError({ code: RpcErrorCode.InternalError, message: error instanceof Error ? error.message : String(error) });
    }
    if (isErrorReply(reply)) throw new RpcError(reply.error);
    return (reply as { result: NativeResult<M> } | null)?.result as NativeResult<M>;
  },

  on<T extends keyof NativeEvents>(topic: T, fn: (payload: NativeEvents[T]) => void): () => void {
    installNativeReceiver();
    return events.on(topic, fn);
  },

  /** Dev and tests: simulate a host event. */
  emit<T extends keyof NativeEvents>(topic: T, payload: NativeEvents[T]): void {
    events.emit(topic, payload);
  },
};
