import {
  EVENT_METHOD,
  isNotification,
  isResponse,
  type BackendEventTopic,
  type BackendEvents,
  type BackendMethod,
  type BackendParams,
  type BackendResult,
  type EventEnvelope,
  type RpcMessage,
} from "@opencast/protocol";
import { Emitter } from "./emitter";
import { cancelledError, CONNECTION_LOST, REQUEST_TIMEOUT, RpcError } from "./errors";
import { getEnv } from "./env";

export type ConnectionState = "connecting" | "open" | "reconnecting" | "closed";

export interface CallOptions {
  signal?: AbortSignal;
  /** Milliseconds; 0 disables the timeout. Defaults per method (see `defaultTimeout`). */
  timeoutMs?: number;
}

/** Methods whose params are `void` may be called without params. */
export type CallArgs<M extends BackendMethod> = [BackendParams<M>] extends [void]
  ? [params?: undefined, options?: CallOptions]
  : [params: BackendParams<M>, options?: CallOptions];

export interface BackendClient {
  readonly kind: "websocket" | "mock";
  call<M extends BackendMethod>(method: M, ...args: CallArgs<M>): Promise<BackendResult<M>>;
  on<T extends BackendEventTopic>(topic: T, fn: (payload: BackendEvents[T]) => void): () => void;
  getState(): ConnectionState;
  onStateChange(fn: (state: ConnectionState) => void): () => void;
  close(): void;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const LONG_TIMEOUT_MS = 10 * 60_000;
const LONG_RUNNING = /^(extensions\.(install|update|develop|store\.)|data\.|sync\.(connect|now|wipeRemote)|scripts\.run|ai\.providers\.(test|refreshModels)|ai\.mcp\.test|snippets\.import|quicklinks\.import|ai\.commands\.import)/;

export function defaultTimeout(method: string): number {
  return LONG_RUNNING.test(method) ? LONG_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;
}

/** Reconnect delay: 250ms doubling up to 5s, with ±20% jitter. */
export function reconnectDelay(attempt: number, random: () => number = Math.random): number {
  const base = Math.min(5000, 250 * 2 ** Math.max(0, attempt));
  return Math.round(base * (0.8 + random() * 0.4));
}

interface Pending {
  method: string;
  frame: string;
  sent: boolean;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  cleanup: () => void;
}

type SocketFactory = (url: string) => WebSocket;

/**
 * JSON-RPC 2.0 client over the backend WebSocket. Requests issued while the
 * socket is (re)connecting are queued; requests already sent when the socket
 * drops fail with CONNECTION_LOST because the backend aborts them too.
 */
export class WebSocketBackend implements BackendClient {
  readonly kind = "websocket" as const;
  private socket: WebSocket | null = null;
  private state: ConnectionState = "connecting";
  private attempt = 0;
  private nextId = 1;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private readonly pending = new Map<number, Pending>();
  private readonly events = new Emitter<BackendEvents>();
  private readonly stateListeners = new Set<(state: ConnectionState) => void>();

  constructor(
    private readonly url: string,
    private readonly createSocket: SocketFactory = (u) => new WebSocket(u),
  ) {
    this.connect();
  }

  call<M extends BackendMethod>(method: M, ...args: CallArgs<M>): Promise<BackendResult<M>> {
    const [params, options = {}] = args as [unknown, CallOptions | undefined];
    const { signal } = options;
    if (signal?.aborted) return Promise.reject(cancelledError(method));
    if (this.closed) return Promise.reject(new RpcError({ code: CONNECTION_LOST, message: "Backend connection closed" }));

    const id = this.nextId++;
    const frame = JSON.stringify(params === undefined ? { jsonrpc: "2.0", id, method } : { jsonrpc: "2.0", id, method, params });
    const timeoutMs = options.timeoutMs ?? defaultTimeout(method);

    return new Promise<BackendResult<M>>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const onAbort = () => {
        const entry = this.pending.get(id);
        if (!entry) return;
        if (entry.sent) this.sendRaw(JSON.stringify({ jsonrpc: "2.0", method: "$/cancel", params: { id } }));
        this.settle(id)?.reject(cancelledError(method));
      };
      const entry: Pending = {
        method,
        frame,
        sent: false,
        resolve: resolve as (value: unknown) => void,
        reject,
        cleanup: () => {
          if (timer) clearTimeout(timer);
          signal?.removeEventListener("abort", onAbort);
        },
      };
      this.pending.set(id, entry);
      signal?.addEventListener("abort", onAbort, { once: true });
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          if (entry.sent) this.sendRaw(JSON.stringify({ jsonrpc: "2.0", method: "$/cancel", params: { id } }));
          this.settle(id)?.reject(new RpcError({ code: REQUEST_TIMEOUT, message: `${method} timed out after ${timeoutMs} ms` }));
        }, timeoutMs);
      }
      if (this.state === "open") this.flush(entry);
    });
  }

  on<T extends BackendEventTopic>(topic: T, fn: (payload: BackendEvents[T]) => void): () => void {
    return this.events.on(topic, fn);
  }

  getState(): ConnectionState {
    return this.state;
  }

  onStateChange(fn: (state: ConnectionState) => void): () => void {
    this.stateListeners.add(fn);
    return () => this.stateListeners.delete(fn);
  }

  close(): void {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.socket?.close();
    this.failAll(new RpcError({ code: CONNECTION_LOST, message: "Backend connection closed" }), () => true);
    this.setState("closed");
  }

  private connect(): void {
    const socket = this.createSocket(this.url);
    this.socket = socket;
    socket.onopen = () => {
      this.attempt = 0;
      this.setState("open");
      for (const entry of this.pending.values()) if (!entry.sent) this.flush(entry);
    };
    socket.onmessage = (event) => this.onMessage(String(event.data));
    socket.onclose = () => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.failAll(new RpcError({ code: CONNECTION_LOST, message: "Lost connection to the OpenCast backend" }), (entry) => entry.sent);
      if (this.closed) return;
      this.setState("reconnecting");
      this.reconnectTimer = setTimeout(() => this.connect(), reconnectDelay(this.attempt++));
    };
    socket.onerror = () => {
      // onclose follows and schedules the reconnect.
    };
  }

  private onMessage(raw: string): void {
    let message: RpcMessage;
    try {
      message = JSON.parse(raw) as RpcMessage;
    } catch {
      console.warn("[opencast] dropped malformed backend frame");
      return;
    }
    if (isResponse(message)) {
      if (typeof message.id !== "number") return;
      const entry = this.settle(message.id);
      if (!entry) return;
      if ("error" in message) entry.reject(new RpcError(message.error));
      else entry.resolve(message.result);
      return;
    }
    if (isNotification(message) && message.method === EVENT_METHOD) {
      const envelope = message.params as EventEnvelope<BackendEventTopic> | undefined;
      if (envelope?.topic) this.events.emit(envelope.topic, envelope.payload as never);
    }
  }

  private flush(entry: Pending): void {
    if (this.sendRaw(entry.frame)) entry.sent = true;
  }

  private sendRaw(frame: string): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(frame);
    return true;
  }

  private settle(id: number): Pending | undefined {
    const entry = this.pending.get(id);
    if (!entry) return undefined;
    this.pending.delete(id);
    entry.cleanup();
    return entry;
  }

  private failAll(error: RpcError, predicate: (entry: Pending) => boolean): void {
    for (const [id, entry] of [...this.pending]) {
      if (predicate(entry)) this.settle(id)?.reject(error);
    }
  }

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;
    for (const fn of [...this.stateListeners]) fn(state);
  }
}

let client: BackendClient | null = null;

/**
 * The mock backend (fixtures + handlers) is loaded with a dynamic import so it
 * stays out of the production bundle's main chunk.
 */
function createLazyMockBackend(): BackendClient {
  const events = new Emitter<BackendEvents>();
  const ready = import("./mock").then((m) => m.createMockBackend(events));
  return {
    kind: "mock",
    call: async (method, ...args) => (await ready).call(method, ...args),
    on: (topic, fn) => events.on(topic, fn),
    getState: () => "open",
    onStateChange: () => () => undefined,
    close: () => undefined,
  };
}

export function getBackend(): BackendClient {
  if (client) return client;
  const env = getEnv();
  if (env.mock || !env.backendUrl || !env.token) {
    client = createLazyMockBackend();
  } else {
    const url = new URL(env.backendUrl);
    url.searchParams.set("token", env.token);
    url.searchParams.set("window", env.window);
    client = new WebSocketBackend(url.toString());
  }
  return client;
}

/** Replace the client (tests, gallery). */
export function setBackend(next: BackendClient | null): void {
  client = next;
}

/** Shorthand: `backend.call("search.root", { query })`. */
export const backend: BackendClient = {
  get kind() {
    return getBackend().kind;
  },
  call: (method, ...args) => getBackend().call(method, ...args),
  on: (topic, fn) => getBackend().on(topic, fn),
  getState: () => getBackend().getState(),
  onStateChange: (fn) => getBackend().onStateChange(fn),
  close: () => getBackend().close(),
};
