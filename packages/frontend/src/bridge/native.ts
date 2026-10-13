import { RpcErrorCode, type NativeEvents, type NativeMethod, type NativeParams, type NativeResult, type RpcErrorObject } from "@opencast/protocol";
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
    __opencastNative?: NativeReceiver;
  }
}

const events = new Emitter<NativeEvents>();

let receiver: NativeReceiver | undefined;
/** A `window.route` that arrived before any subscriber (first window open races React mount). */
let pendingRoute: NativeEvents["window.route"] | undefined;
let routeSubscribers = 0;

/**
 * Install `window.__opencastNative` as early as possible. Safe to call more than once.
 *
 * The Swift host injects a placeholder receiver at document start that queues
 * events nobody listens to yet (WebKit can finish loading before modules run);
 * replace it and replay its queue so host events reach `native.on` subscribers.
 */
export function installNativeReceiver(): NativeReceiver {
  if (!receiver) {
    const placeholder = window.__opencastNative as (NativeReceiver & { pending?: [keyof NativeEvents, unknown][] }) | undefined;
    const installed: NativeReceiver = {
      emit: (topic, payload) => {
        if (topic === "window.route" && routeSubscribers === 0) pendingRoute = payload as NativeEvents["window.route"];
        events.emit(topic, payload);
      },
      on: (topic, fn) => events.on(topic, fn),
    };
    receiver = installed;
    window.__opencastNative = installed;
    for (const [topic, payload] of placeholder?.pending?.splice(0) ?? []) installed.emit(topic, payload as never);
  }
  return receiver;
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
    const off = events.on(topic, fn);
    if (topic !== "window.route") return off;
    routeSubscribers++;
    if (pendingRoute) {
      const route = pendingRoute;
      pendingRoute = undefined;
      queueMicrotask(() => fn(route as NativeEvents[T]));
    }
    return () => {
      routeSubscribers--;
      off();
    };
  },

  /** Dev and tests: simulate a host event. */
  emit<T extends keyof NativeEvents>(topic: T, payload: NativeEvents[T]): void {
    events.emit(topic, payload);
  },
};
