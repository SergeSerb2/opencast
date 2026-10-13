import { useSyncExternalStore } from "react";
import { native } from "./native";

let appName: string | null = null;
const listeners = new Set<() => void>();
let started = false;

function refresh(): void {
  native
    .call("apps.previous")
    .then((app) => {
      const next = app?.name ?? null;
      if (next === appName) return;
      appName = next;
      for (const fn of listeners) fn();
    })
    .catch(() => undefined);
}

function start(): void {
  if (started) return;
  started = true;
  refresh();
  native.on("window.didShow", refresh);
}

/** Name of the app that was frontmost before the launcher opened ("Paste to Safari"). */
export function getPreviousAppName(): string | null {
  start();
  return appName;
}

export function usePreviousAppName(): string | null {
  start();
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => appName,
  );
}

/** "Paste to Safari", or a generic title when the app is unknown. */
export function pasteTitle(name: string | null = getPreviousAppName()): string {
  return name ? `Paste to ${name}` : "Paste to Active App";
}
