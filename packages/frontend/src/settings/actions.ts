import type { WindowKind } from "@opencast/protocol";
import { native } from "../bridge/native";
import { showFailureToast } from "../components/feedback/toast-store";

/** Open a web link in the default browser. */
export function openUrl(url: string): void {
  native.call("open.url", { url }).catch((error: unknown) => showFailureToast("Could not open link", error));
}

export function showInFinder(path: string): void {
  native.call("open.showInFinder", { path }).catch((error: unknown) => showFailureToast("Could not show in Finder", error));
}

/** Show another OpenCast window, optionally at a route (e.g. a launcher command). */
export function openWindow(kind: WindowKind, route?: string): void {
  native.call("window.show", route ? { kind, route } : { kind }).catch((error: unknown) => showFailureToast("Could not open window", error));
}
