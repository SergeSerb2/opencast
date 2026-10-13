import { useEffect, useRef, useState, type RefObject } from "react";
import { getEnv } from "../../bridge/env";
import { useConnectionState, useEvent, useLatest, useNativeEvent } from "../../bridge/hooks";
import { native } from "../../bridge/native";
import { getSetting, useSetting } from "../../bridge/settings";
import { useAlertStore } from "../../components/feedback/alert-store";
import { showFailureToast } from "../../components/feedback/toast-store";
import { actionsWithShortcuts, type ActionPanelModel } from "../../components/actions/model";
import { eventKey, matchesShortcut } from "../../lib/keyboard";
import { runAction, setNotesZoom } from "../actions";
import type { NotesController } from "../controller";
import { useNotesPreferences, setNotesPreference } from "../lib/preferences";
import { parseNotesRoute } from "../lib/routes";
import { NOTES_SHORTCUTS as S } from "../lib/shortcuts";
import { ZOOM_DEFAULT, clampZoom, zoomIn, zoomOut } from "../lib/zoom";
import { closePanel, openPanel, useNotesStore } from "../store";

/** Whether the pointer is over the window; the header title dims and its buttons hide otherwise (§7.2). */
export function useWindowHover(): boolean {
  const [hovered, setHovered] = useState(false);
  useEffect(() => {
    const enter = () => setHovered(true);
    const leave = (event: PointerEvent | MouseEvent) => {
      if (!event.relatedTarget) setHovered(false);
    };
    document.addEventListener("pointermove", enter, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    document.addEventListener("mouseout", leave);
    return () => {
      document.removeEventListener("pointermove", enter);
      document.documentElement.removeEventListener("pointerleave", leave);
      document.removeEventListener("mouseout", leave);
    };
  }, []);
  return hovered;
}

/** Keep the window's floating level in sync with the "always on top" setting. */
export function useAlwaysOnTop(): void {
  const floating = useSetting("notes.alwaysOnTop");
  useEffect(() => {
    void native.call("window.setFloating", { kind: "notes", floating }).catch((error: unknown) => showFailureToast("Could not change Always on Top", error));
  }, [floating]);
}

/** Native window events, routes and backend note changes. */
export function useNotesEvents(controller: NotesController): void {
  const refresh = (task: Promise<void>) => void task.catch((error: unknown) => showFailureToast("Could not refresh notes", error));
  useNativeEvent("window.route", (event) => {
    if (event.kind !== "notes") return;
    refresh(controller.route(parseNotesRoute(event.route, event.payload)));
  });
  useNativeEvent("window.didShow", ({ kind }) => {
    if (kind !== "notes") return;
    controller.focus();
    void controller.windowActivated();
  });
  useNativeEvent("window.didBecomeKey", ({ kind }) => {
    if (kind === "notes") void controller.windowActivated();
  });
  useNativeEvent("window.didResignKey", ({ kind }) => {
    if (kind === "notes") void controller.windowDeactivated();
  });
  useNativeEvent("window.didHide", ({ kind }) => {
    if (kind === "notes") void controller.windowDeactivated();
  });
  useEvent("notes.changed", ({ id, deleted }) => refresh(controller.handleRemoteChange(id, Boolean(deleted))));
  useEvent("entities.changed", ({ collection, ids }) => {
    if (collection === "notes") refresh(controller.handleCollectionChange(ids));
  });
  const connection = useConnectionState();
  useEffect(() => {
    if (connection === "open") refresh(controller.windowActivated());
  }, [connection, controller]);
  useEffect(() => {
    const flush = () => void controller.windowDeactivated();
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [controller]);
}

/** Esc with "Escape Key Loses Focus": leave the editor and hand focus back to the previous app. */
async function loseFocus(controller: NotesController): Promise<void> {
  controller.currentEditor?.commands.blur();
  await controller.windowDeactivated();
  if (!getEnv().native) return;
  try {
    const previous = await native.call("apps.previous");
    if (previous) await native.call("apps.activate", { bundleIdOrPath: previous.bundleId ?? previous.path });
  } catch {
    // Without a previous app the window simply keeps its (now unfocused) editor.
  }
}

/** Window-level shortcuts: ⌘K, ⌘P, zoom, ⌘W, Esc and every action shortcut while no panel is open. */
export function useNotesKeyboard(controller: NotesController, model: ActionPanelModel): void {
  const latest = useLatest(model);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing) return;
      if (useAlertStore.getState().alert) return;
      const state = useNotesStore.getState();
      const key = eventKey(event);
      const cmdOnly = event.metaKey && !event.ctrlKey && !event.altKey;

      if (matchesShortcut(event, S.actions)) {
        event.preventDefault();
        if (state.panel?.kind === "actions") {
          closePanel();
          controller.focus();
        }
        else openPanel({ kind: "actions" });
        return;
      }
      if (matchesShortcut(event, S.browse)) {
        event.preventDefault();
        if (state.panel?.kind === "browse") {
          closePanel();
          controller.focus();
        }
        else openPanel({ kind: "browse" });
        return;
      }
      if (state.panel) return;

      if (key === "escape" && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
        event.preventDefault();
        if (state.findOpen) {
          useNotesStore.setState({ findOpen: false });
          controller.focus();
        } else if (state.linkEditing) {
          useNotesStore.setState({ linkEditing: false });
        } else if (getSetting("notes.escapeKeyLosesFocus")) {
          void loseFocus(controller);
        } else if (getSetting("keyboard.escapeKeyClosesWindow")) {
          void controller.windowDeactivated();
          void native.call("window.hide", { kind: "notes", restoreFocus: true }).catch(() => undefined);
        }
        return;
      }
      if (cmdOnly && key === "w" && !event.shiftKey) {
        event.preventDefault();
        void controller.windowDeactivated();
        void native.call("window.hide", { kind: "notes", restoreFocus: true }).catch(() => undefined);
        return;
      }
      if (cmdOnly && (key === "=" || key === "+")) {
        event.preventDefault();
        const zoom = clampZoom(getSetting("notes.zoom"));
        if (zoomIn(zoom) !== zoom) void setNotesZoom(zoomIn(zoom));
        return;
      }
      if (cmdOnly && key === "-" && !event.shiftKey) {
        event.preventDefault();
        const zoom = clampZoom(getSetting("notes.zoom"));
        if (zoomOut(zoom) !== zoom) void setNotesZoom(zoomOut(zoom));
        return;
      }
      if (cmdOnly && key === "0" && !event.shiftKey) {
        event.preventDefault();
        if (clampZoom(getSetting("notes.zoom")) !== ZOOM_DEFAULT) void setNotesZoom(ZOOM_DEFAULT, "Zoom reset to default");
        return;
      }
      for (const action of actionsWithShortcuts(latest.current)) {
        if (action.shortcut && matchesShortcut(event, action.shortcut)) {
          event.preventDefault();
          void runAction(action);
          return;
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [controller, latest]);
}

const MIN_HEIGHT = 128;
const MAX_HEIGHT = 860;
/** Room the ⌘K panel and the note browser need below the header while open. */
const PANEL_HEIGHT = 442;

/**
 * Window auto-sizing (§7.1): fit the window to the content between 128 and
 * 860pt. A resize the window did not ask for is a manual resize and turns
 * auto-sizing off, as in Raycast ("Enable Window Auto-Sizing" restores it).
 */
export function autoSizeHeight(contentHeight: number, scale: number, panelOpen: boolean): number {
  return Math.round(Math.min(MAX_HEIGHT * scale, Math.max(MIN_HEIGHT * scale, panelOpen ? PANEL_HEIGHT * scale : 0, contentHeight)));
}

export function useAutoSize(contentRef: RefObject<HTMLElement | null>): void {
  const enabled = useNotesPreferences((state) => state.autoSize);
  const panelOpen = useNotesStore((state) => state.panel !== null);
  const uiZoom = useSetting("general.uiZoom");
  const requested = useRef<{ height: number; at: number } | null>(null);

  useEffect(() => {
    const content = contentRef.current;
    if (!enabled || !content || !getEnv().native) return;
    const scale = Number.isFinite(uiZoom) && uiZoom > 0 ? uiZoom : 1;
    const fit = () => {
      // The measured content already includes header, find and footer padding.
      const target = autoSizeHeight(content.offsetHeight, scale, panelOpen);
      if (Math.abs(target - window.innerHeight) < 1) return;
      requested.current = { height: target, at: Date.now() };
      void native.call("window.setSize", { kind: "notes", width: window.innerWidth, height: target }).catch(() => undefined);
    };
    const observer = new ResizeObserver(fit);
    observer.observe(content);
    fit();
    const onResize = () => {
      const last = requested.current;
      if (last && Math.abs(window.innerHeight - last.height) <= 2) return;
      // The host settles our own request within a moment; later changes come from the user.
      if (!last || Date.now() - last.at > 500) setNotesPreference("autoSize", false);
    };
    window.addEventListener("resize", onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onResize);
    };
  }, [enabled, panelOpen, uiZoom, contentRef]);
}
