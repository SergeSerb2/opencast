import { native } from "../bridge/native";
import { parseNotesRoute, type NotesRoute } from "./lib/routes";

let pending: NotesRoute | null = null;
let stop: (() => void) | null = null;

/**
 * Listen for `window.route` before React mounts: the host replays the route
 * when the page finishes loading, which can precede the app's own listeners.
 */
export function captureEarlyRoute(): void {
  stop ??= native.on("window.route", (event) => {
    if (event.kind === "notes") pending = parseNotesRoute(event.route, event.payload);
  });
}

/** The route to open at boot: one the host sent early, else the URL hash (browser dev). */
export function takeInitialRoute(): NotesRoute {
  stop?.();
  stop = null;
  const route = pending ?? parseNotesRoute(decodeURIComponent(window.location.hash.replace(/^#/, "")));
  pending = null;
  return route;
}
