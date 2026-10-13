import { useEffect, useRef } from "react";
import type { ToastState } from "@surgecast/protocol";
import { backend } from "../bridge/backend";
import { getEnv } from "../bridge/env";
import { useEvent, useNativeEvent } from "../bridge/hooks";
import { native } from "../bridge/native";
import { getSetting, useSetting } from "../bridge/settings";
import { confirmAlert } from "../components/feedback/alert-store";
import { hideToast, showToast } from "../components/feedback/toast-store";
import { eventKey } from "../lib/keyboard";
import { handleLaunchResult, hideLauncher, launchCommand } from "./launch";
import { useLauncherStore } from "./launcher-store";
import { useNavigationStore } from "./navigation";

const EXPANDED_HEIGHT = 475;
const COMPACT_HEIGHT = 64;

/** Show a backend/extension toast in the footer; actions go back through `ext.toast.action`. */
function showRemoteToast(toast: ToastState | null, sessionId?: string): void {
  if (!toast) {
    hideToast();
    return;
  }
  const action = (slot: "primary" | "secondary", spec: ToastState["primaryAction"]) =>
    spec
      ? {
          title: spec.title,
          shortcut: spec.shortcut,
          onAction: () => (sessionId ? backend.call("ext.toast.action", { sessionId, toastId: toast.id, action: slot }) : undefined),
        }
      : undefined;
  showToast({ style: toast.style, title: toast.title, message: toast.message, primaryAction: action("primary", toast.primaryAction), secondaryAction: action("secondary", toast.secondaryAction) });
}

/** Seconds → whether the stack should reset after being hidden for `elapsedMs`. */
export function shouldPopToRoot(timeoutSeconds: number, elapsedMs: number): boolean {
  if (timeoutSeconds < 0) return false;
  if (timeoutSeconds === 0) return true;
  return elapsedMs >= timeoutSeconds * 1000;
}

/** Height reported to the native window: compact shows only the header while root search is empty. */
export function launcherContentHeight(windowMode: "expanded" | "compact", depth: number, rootQuery: string): number {
  return windowMode === "compact" && depth === 0 && rootQuery.trim() === "" ? COMPACT_HEIGHT : EXPANDED_HEIGHT;
}

/**
 * Window-level launcher behavior: backend/native navigation events, toasts,
 * alerts, pop-to-root on reopen, global shortcuts, and content height.
 */
export function useLauncherBehavior(setVisible: (visible: boolean) => void): void {
  const stackDepth = useNavigationStore((s) => s.stack.length - 1);
  const rootQuery = useLauncherStore((s) => s.rootQuery);
  const windowMode = useSetting("general.windowMode");
  const hiddenAt = useRef<number | null>(null);
  const kind = getEnv().window;

  // ---- backend events ------------------------------------------------------
  useEvent("launcher.navigate", (event) => {
    const nav = useNavigationStore.getState();
    switch (event.action) {
      case "popToRoot":
        nav.popToRoot({ clearSearch: event.clearSearchBar });
        break;
      case "close":
        if (event.clearSearchBar) nav.popToRoot({ clearSearch: true });
        hideLauncher();
        break;
      case "show":
        void native.call("window.show", { kind: "main" }).catch(() => undefined);
        break;
      case "launch":
        if (event.result) handleLaunchResult(event.result);
        break;
    }
  });
  useEvent("launcher.toast", ({ toast }) => showRemoteToast(toast));
  useEvent("ext.toast", ({ toast, sessionId }) => showRemoteToast(toast, sessionId));
  useEvent("ext.alert", ({ alertId, options }) => {
    void confirmAlert(options).then((confirmed) => backend.call("ext.alert.respond", { alertId, confirmed }).catch(() => undefined));
  });
  useEvent("ext.session.closed", ({ sessionId, reason, error }) => {
    const nav = useNavigationStore.getState();
    if (reason === "popToRoot") nav.popToRoot({ clearSearch: true });
    else {
      const entry = nav.stack.find((e) => e.kind === "extension" && e.sessionId === sessionId);
      if (entry) nav.remove(entry.key, { sessionClosed: true });
    }
    if (reason === "error") showToast({ style: "failure", title: "Command failed", message: error });
  });

  // ---- native window events --------------------------------------------------
  useNativeEvent("window.didHide", (event) => {
    if (event.kind !== kind) return;
    hiddenAt.current = Date.now();
    setVisible(false);
  });
  useNativeEvent("window.didShow", (event) => {
    if (event.kind !== kind) return;
    const since = hiddenAt.current;
    hiddenAt.current = null;
    if (!getSetting("developer.disablePopToRootSearch") && since !== null && shouldPopToRoot(getSetting("launcher.popToRootTimeout"), Date.now() - since)) useNavigationStore.getState().popToRoot({ clearSearch: true });
    else {
      // Kept text is selected so typing replaces it.
      requestAnimationFrame(() => document.querySelector<HTMLInputElement>(".sc-launcher-entry[data-active] .sc-search-bar__input")?.select());
    }
    setVisible(true);
  });
  useNativeEvent("window.route", (event) => {
    if (event.kind !== kind || !event.route) return;
    const nav = useNavigationStore.getState();
    const [scheme, ...rest] = event.route.split(":");
    const target = rest.join(":");
    if (scheme === "command" && target) {
      nav.popToRoot();
      const payload = (event.payload ?? {}) as { source?: "hotkey" | "deeplink"; arguments?: Record<string, string>; launchContext?: Record<string, unknown>; fallbackText?: string };
      void launchCommand(target, { source: payload.source ?? "hotkey", arguments: payload.arguments, launchContext: payload.launchContext, fallbackText: payload.fallbackText });
    } else if (scheme === "root") nav.popToRoot({ clearSearch: true });
    else if (scheme === "quick-ai") {
      nav.popToRoot();
      nav.push({ kind: "quick-ai", prompt: target || undefined, title: "Quick AI" });
    }
  });

  // ---- global shortcuts --------------------------------------------------------
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.metaKey || event.ctrlKey || event.altKey) return;
      const key = eventKey(event);
      if (key === "," && !event.shiftKey) {
        event.preventDefault();
        void native.call("window.show", { kind: "settings" }).catch(() => undefined);
        hideLauncher();
      } else if (key === "w" && !event.shiftKey) {
        event.preventDefault();
        hideLauncher();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // ---- content height ------------------------------------------------------------
  const height = launcherContentHeight(windowMode, stackDepth, rootQuery);
  useEffect(() => {
    void native.call("window.setContentHeight", { kind: "main", height, animate: true }).catch(() => undefined);
  }, [height]);
}
