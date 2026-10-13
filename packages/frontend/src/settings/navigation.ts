import { create } from "zustand";

export const DEFAULT_ROUTE = "general";

/** Routes that other windows and older links use for the same page. */
const ROUTE_ALIASES: Record<string, string> = {
  extensions: "shortcuts",
  "ai/models-and-providers": "ai/models",
  "ai/providers": "ai/models",
  "ai/mcp": "mcp",
  sync: "cloud-sync",
  clipboard: "clipboard-history",
  "emoji-symbols": "emoji",
  files: "file-search",
  scripts: "script-commands",
  window: "window-management",
};

/**
 * Canonical form of a route from `window.route`, a URL hash or a link:
 * no leading "#"/"/", no trailing "/", known aliases resolved. Page names
 * are case-insensitive; identifiers (extension names, provider ids) keep
 * their case.
 */
export function normalizeRoute(raw: string | null | undefined): string {
  const trimmed = (raw ?? "").trim().replace(/^#/, "").replace(/^\/+/, "").replace(/\/+$/, "");
  if (!trimmed) return DEFAULT_ROUTE;
  const parts = trimmed.split("/");
  parts[0] = parts[0].toLowerCase();
  if (parts[0] !== "extensions" && parts.length > 1) parts[1] = parts[1].toLowerCase();
  const route = parts.join("/");
  return ROUTE_ALIASES[route] ?? route;
}

export interface HistoryState {
  current: string;
  back: string[];
  forward: string[];
}

const MAX_HISTORY = 50;

/** Visit `route`: the current page moves onto the back stack and forward history is dropped. */
export function visit(state: HistoryState, route: string): HistoryState {
  if (route === state.current) return state;
  return { current: route, back: [...state.back, state.current].slice(-MAX_HISTORY), forward: [] };
}

/** Swap the current page without adding history (e.g. "new provider" → the saved provider). */
export function replaceRoute(state: HistoryState, route: string): HistoryState {
  return { ...state, current: route };
}

export function goBack(state: HistoryState): HistoryState {
  if (!state.back.length) return state;
  return { current: state.back[state.back.length - 1], back: state.back.slice(0, -1), forward: [state.current, ...state.forward] };
}

export function goForward(state: HistoryState): HistoryState {
  if (!state.forward.length) return state;
  return { current: state.forward[0], back: [...state.back, state.current], forward: state.forward.slice(1) };
}

interface NavigationStore extends HistoryState {
  /** Setting row to scroll to and pulse once the page renders (from settings search). */
  highlight: string | null;
  navigate: (route: string, options?: { highlight?: string; replace?: boolean }) => void;
  back_: () => void;
  forward_: () => void;
  clearHighlight: () => void;
}

function initialRoute(): string {
  return typeof location === "undefined" ? DEFAULT_ROUTE : normalizeRoute(location.hash);
}

export const useSettingsNavigation = create<NavigationStore>((set) => ({
  current: initialRoute(),
  back: [],
  forward: [],
  highlight: null,
  navigate: (route, options) => set((state) => ({ ...(options?.replace ? replaceRoute(state, normalizeRoute(route)) : visit(state, normalizeRoute(route))), highlight: options?.highlight ?? null })),
  back_: () => set((state) => ({ ...goBack(state), highlight: null })),
  forward_: () => set((state) => ({ ...goForward(state), highlight: null })),
  clearHighlight: () => set({ highlight: null }),
}));

export function navigate(route: string, options?: { highlight?: string; replace?: boolean }): void {
  useSettingsNavigation.getState().navigate(route, options);
}
