/** Minimal typed pub/sub used by the backend and native bridges. */
export class Emitter<Events extends object> {
  private readonly listeners = new Map<keyof Events, Set<(payload: never) => void>>();

  on<T extends keyof Events>(topic: T, fn: (payload: Events[T]) => void): () => void {
    let set = this.listeners.get(topic);
    if (!set) {
      set = new Set();
      this.listeners.set(topic, set);
    }
    set.add(fn as (payload: never) => void);
    return () => {
      set.delete(fn as (payload: never) => void);
    };
  }

  emit<T extends keyof Events>(topic: T, payload: Events[T]): void {
    const set = this.listeners.get(topic);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        (fn as (payload: Events[T]) => void)(payload);
      } catch (error) {
        console.error(`[surgecast] listener for "${String(topic)}" failed`, error);
      }
    }
  }
}
