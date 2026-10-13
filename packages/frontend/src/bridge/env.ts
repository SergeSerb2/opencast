import type { WindowKind } from "@surgecast/protocol";

/** Object the native host injects into every web view at document start. */
export interface InjectedEnvironment {
  backendUrl: string;
  token: string;
  window: WindowKind;
  platform: "macos";
  macOSMajor: number;
  appVersion: string;
  dev: boolean;
}

export interface SurgecastEnv {
  /** WebSocket URL of the backend RPC endpoint, without the query string. */
  backendUrl: string | null;
  token: string | null;
  window: WindowKind;
  macOSMajor: number;
  appVersion: string;
  dev: boolean;
  /** Running inside the Swift host's WKWebView (native message handler present). */
  native: boolean;
  /** Use the in-browser mock backend instead of a WebSocket connection. */
  mock: boolean;
  /** Dev-only appearance override from `?appearance=dark|light`. */
  appearanceOverride: "dark" | "light" | null;
}

interface NativeMessageHandler {
  postMessage(message: { method: string; params?: unknown }): Promise<unknown>;
}

declare global {
  interface Window {
    __SURGECAST__?: Partial<InjectedEnvironment>;
    webkit?: { messageHandlers?: { native?: NativeMessageHandler } };
  }
}

const WINDOW_KINDS: readonly WindowKind[] = ["main", "ai-chat", "notes", "settings", "welcome", "theme-studio"];

function windowFromPath(pathname: string): WindowKind {
  const page = pathname.split("/").pop()?.replace(/\.html$/, "") ?? "";
  return (WINDOW_KINDS as readonly string[]).includes(page) ? (page as WindowKind) : "main";
}

/** Pure resolver so the precedence rules can be tested without a browser. */
export function resolveEnvironment(input: {
  injected?: Partial<InjectedEnvironment>;
  search: string;
  pathname: string;
  hasNativeHandler: boolean;
}): SurgecastEnv {
  const params = new URLSearchParams(input.search);
  const injected = input.injected ?? {};
  const backendUrl = injected.backendUrl ?? params.get("backend");
  const token = injected.token ?? params.get("token");
  const windowParam = params.get("window");
  const window = injected.window ?? ((WINDOW_KINDS as readonly string[]).includes(windowParam ?? "") ? (windowParam as WindowKind) : windowFromPath(input.pathname));
  const macOSParam = Number(params.get("macos"));
  const appearance = params.get("appearance");
  const wantsMock = params.get("mock") === "1" || params.get("mock") === "true";
  return {
    backendUrl: backendUrl || null,
    token: token || null,
    window,
    macOSMajor: injected.macOSMajor ?? (Number.isFinite(macOSParam) && macOSParam > 0 ? macOSParam : 27),
    appVersion: injected.appVersion ?? "dev",
    dev: injected.dev ?? !input.hasNativeHandler,
    native: input.hasNativeHandler,
    mock: wantsMock || !backendUrl || !token,
    appearanceOverride: appearance === "dark" || appearance === "light" ? appearance : null,
  };
}

let cached: SurgecastEnv | null = null;

export function getEnv(): SurgecastEnv {
  if (!cached) {
    cached = resolveEnvironment({
      injected: window.__SURGECAST__,
      search: window.location.search,
      pathname: window.location.pathname,
      hasNativeHandler: Boolean(window.webkit?.messageHandlers?.native),
    });
  }
  return cached;
}
