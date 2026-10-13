import { useCallback, useEffect, useRef, useState } from "react";
import type { StoreExtension } from "@opencast/protocol";
import { backend } from "../../../bridge/backend";
import { isCancelled } from "../../../bridge/errors";
import { mergeStorePages } from "./model";

/** `value`, updated only after it stopped changing for `delay` ms (search-as-you-type). */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export interface StoreSearch {
  items: StoreExtension[];
  hasMore: boolean;
  isLoading: boolean;
  error: unknown;
  loadMore: () => void;
  reload: () => void;
}

interface SearchState {
  items: StoreExtension[];
  hasMore: boolean;
  isLoading: boolean;
  error: unknown;
  page: number;
}

const IDLE: SearchState = { items: [], hasMore: false, isLoading: false, error: undefined, page: 0 };

/**
 * Paginated `extensions.store.search`. A new query or category replaces the
 * results (the previous request is cancelled); `loadMore` appends the next page.
 */
export function useStoreSearch({ query, category, enabled }: { query: string; category?: string; enabled: boolean }): StoreSearch {
  const [state, setState] = useState<SearchState>({ ...IDLE, isLoading: enabled });
  const [reloadToken, setReloadToken] = useState(0);
  const pending = useRef<AbortController | null>(null);
  const params = useRef({ query, category });
  params.current = { query, category };

  const fetchPage = useCallback((page: number) => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setState((s) => ({ ...s, isLoading: true, error: undefined }));
    const { query, category } = params.current;
    backend
      .call("extensions.store.search", { query: query || undefined, category, page }, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setState((s) => ({ items: page === 1 ? result.items : mergeStorePages(s.items, result.items), hasMore: result.hasMore, isLoading: false, error: undefined, page }));
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || isCancelled(error)) return;
        setState((s) => ({ ...s, hasMore: false, isLoading: false, error }));
      });
  }, []);

  useEffect(() => {
    if (!enabled) {
      setState(IDLE);
      return;
    }
    fetchPage(1);
    return () => pending.current?.abort();
  }, [enabled, query, category, reloadToken, fetchPage]);

  const loadMore = useCallback(() => {
    if (!state.isLoading && state.hasMore) fetchPage(state.page + 1);
  }, [state.isLoading, state.hasMore, state.page, fetchPage]);

  const reload = useCallback(() => setReloadToken((t) => t + 1), []);

  return { items: state.items, hasMore: state.hasMore, isLoading: state.isLoading, error: state.error, loadMore, reload };
}
