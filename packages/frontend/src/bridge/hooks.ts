import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import type { BackendEventTopic, BackendEvents, BackendMethod, BackendParams, BackendResult, NativeEvents } from "@surgecast/protocol";
import { backend, type CallOptions, type ConnectionState } from "./backend";
import { isCancelled } from "./errors";
import { native } from "./native";
import { refetchRulesFor, type RefetchRule } from "./refetch";

/** Run `fn` on every backend event of `topic`. `fn` may change between renders. */
export function useEvent<T extends BackendEventTopic>(topic: T, fn: (payload: BackendEvents[T]) => void): void {
  const ref = useLatest(fn);
  useEffect(() => backend.on(topic, (payload) => ref.current(payload)), [topic, ref]);
}

/** Run `fn` on every native host event of `topic`. */
export function useNativeEvent<T extends keyof NativeEvents>(topic: T, fn: (payload: NativeEvents[T]) => void): void {
  const ref = useLatest(fn);
  useEffect(() => native.on(topic, (payload) => ref.current(payload)), [topic, ref]);
}

export function useConnectionState(): ConnectionState {
  return useSyncExternalStore(
    (onChange) => backend.onStateChange(onChange),
    () => backend.getState(),
  );
}

export interface QueryOptions<M extends BackendMethod> {
  /** Skip the request while false. */
  enabled?: boolean;
  /** Events that trigger a refetch. Defaults to `refetchRulesFor(method)`. */
  refetchOn?: RefetchRule[];
  /** Keep showing the previous result while a new one loads (default true). */
  keepPreviousData?: boolean;
  onError?: (error: unknown) => void;
  /** Transform before storing (e.g. pick a field). */
  select?: (result: BackendResult<M>) => BackendResult<M>;
}

export interface QueryResult<R> {
  data: R | undefined;
  error: unknown;
  isLoading: boolean;
  refetch: () => void;
  /** Optimistically replace the cached data (e.g. after a mutation). */
  setData: (update: R | ((previous: R | undefined) => R)) => void;
}

/**
 * Query a backend method. Re-runs when `deps` change (default: the JSON of
 * `params`), cancels stale requests with `$/cancel`, and refetches after the
 * events listed in `refetchRulesFor(method)` and after a reconnect.
 */
export function useBackend<M extends BackendMethod>(
  method: M,
  params: BackendParams<M>,
  deps?: readonly unknown[],
  options: QueryOptions<M> = {},
): QueryResult<BackendResult<M>> {
  const { enabled = true, keepPreviousData = true } = options;
  const [data, setDataState] = useState<BackendResult<M> | undefined>(undefined);
  const [error, setError] = useState<unknown>(undefined);
  const [isLoading, setLoading] = useState(enabled);
  const [version, setVersion] = useState(0);
  const paramsRef = useLatest(params);
  const optionsRef = useLatest(options);
  const key = deps ?? [JSON.stringify(params ?? null)];

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    if (!keepPreviousData) setDataState(undefined);
    callUntyped<BackendResult<M>>(method, paramsRef.current, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        const select = optionsRef.current.select;
        setDataState(select ? select(result) : result);
        setError(undefined);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || isCancelled(err)) return;
        setError(err);
        setLoading(false);
        optionsRef.current.onError?.(err);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` stands in for params
  }, [method, enabled, version, ...key]);

  const refetch = useCallback(() => setVersion((v) => v + 1), []);

  const topics = (options.refetchOn ?? refetchRulesFor(method)).map((r) => r.topic);
  const topicsKey = [...new Set(topics)].join(",");

  useEffect(() => {
    if (!enabled) return;
    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      queueMicrotask(() => {
        scheduled = false;
        refetch();
      });
    };
    // Predicates are read at event time so they see the latest params (e.g. another note id).
    const offs = topicsKey.split(",").filter(Boolean).map((topic) =>
      backend.on(topic as BackendEventTopic, (payload) => {
        const rules = (optionsRef.current.refetchOn ?? refetchRulesFor(method)).filter((r) => r.topic === topic);
        if (rules.some((rule) => !rule.when || (rule.when as (p: unknown) => boolean)(payload))) schedule();
      }),
    );
    offs.push(onReconnect(schedule));
    return () => offs.forEach((off) => off());
  }, [method, enabled, refetch, optionsRef, topicsKey]);

  const setData = useCallback((update: BackendResult<M> | ((previous: BackendResult<M> | undefined) => BackendResult<M>)) => {
    setDataState((previous) => (typeof update === "function" ? (update as (p: BackendResult<M> | undefined) => BackendResult<M>)(previous) : update));
  }, []);

  return { data, error, isLoading, refetch, setData };
}

/** Call `fn` when the connection comes back after a drop (not on the first connect). */
export function onReconnect(fn: () => void): () => void {
  let dropped = false;
  return backend.onStateChange((state) => {
    if (state === "reconnecting") dropped = true;
    else if (state === "open" && dropped) {
      dropped = false;
      fn();
    }
  });
}

function callUntyped<R>(method: BackendMethod, params: unknown, options: CallOptions): Promise<R> {
  return (backend.call as (m: BackendMethod, p: unknown, o: CallOptions) => Promise<R>)(method, params, options);
}

/** A ref that always holds the latest value (updated before effects run). */
export function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}
