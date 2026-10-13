import { EventEmitter } from "node:events";
import type { BackendEvents } from "@surgecast/protocol";

type Listener = (payload: unknown) => void;

/**
 * In-process pub/sub. Every topic emitted here is also pushed to all connected
 * frontend windows by the WebSocket server (method "event", params { topic, payload }).
 */
type Events = BackendEvents;

export class EventBus {
  private readonly emitter = new EventEmitter();
  private readonly sinks = new Set<(topic: string, payload: unknown) => void>();

  constructor() {
    this.emitter.setMaxListeners(0);
  }

  emit<T extends keyof Events & string>(topic: T, payload: Events[T]): void {
    this.emitter.emit(topic, payload);
    for (const sink of this.sinks) sink(topic, payload);
  }

  on<T extends keyof Events & string>(topic: T, listener: (payload: Events[T]) => void): () => void {
    this.emitter.on(topic, listener as Listener);
    return () => this.emitter.off(topic, listener as Listener);
  }

  once<T extends keyof Events & string>(topic: T, listener: (payload: Events[T]) => void): void {
    this.emitter.once(topic, listener as Listener);
  }

  /** Receives every event (used by transports that forward events). */
  addSink(sink: (topic: string, payload: unknown) => void): () => void {
    this.sinks.add(sink);
    return () => this.sinks.delete(sink);
  }
}
