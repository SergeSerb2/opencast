import { RpcErrorCode, type NativeEvents, type NativeMethod, type NativeParams, type NativeResult, type PermissionKind, type PermissionStatus } from "@surgecast/protocol";
import type { Emitter } from "./emitter";
import { RpcError } from "./errors";
import { getEnv } from "./env";
import { MOCK_APPS } from "./mock/fixtures/library";

/** DOM events the dev backdrop listens to so browser runs show HUDs and resizes. */
export const DEV_HUD_EVENT = "surgecast:dev-hud";
export const DEV_CONTENT_HEIGHT_EVENT = "surgecast:dev-content-height";
export const DEV_VISIBILITY_EVENT = "surgecast:dev-visibility";

type Fallback = { [M in NativeMethod]?: (params: NativeParams<M>, events: Emitter<NativeEvents>) => NativeResult<M> | Promise<NativeResult<M>> };

const PERMISSIONS: PermissionKind[] = ["accessibility", "screenRecording", "calendar", "reminders", "contacts", "fullDiskAccess", "automation", "inputMonitoring", "location", "microphone"];

function dispatch(name: string, detail: unknown): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/**
 * Browser stand-ins for the Swift host so pages work in `vite dev`. Methods
 * without a meaningful browser equivalent fail with NativeUnavailable.
 */
const fallbacks: Fallback = {
  "app.info": () => ({ version: getEnv().appVersion, build: "browser", macOSVersion: `${getEnv().macOSMajor}.0`, macOSMajor: getEnv().macOSMajor, arch: "arm64", bundlePath: "", dataDir: "" }),
  "window.show": ({ kind, route }, events) => {
    if (kind === getEnv().window) {
      dispatch(DEV_VISIBILITY_EVENT, { visible: true });
      events.emit("window.didShow", { kind });
      return;
    }
    const url = new URL(`./${kind}.html`, window.location.href);
    url.search = window.location.search;
    if (route) url.hash = route;
    window.open(url.toString(), `surgecast-${kind}`);
  },
  "window.hide": ({ kind }, events) => {
    if (kind !== getEnv().window) return;
    dispatch(DEV_VISIBILITY_EVENT, { visible: false });
    events.emit("window.didHide", { kind });
  },
  "window.toggle": () => undefined,
  "window.close": () => undefined,
  "window.setContentHeight": ({ height }) => dispatch(DEV_CONTENT_HEIGHT_EVENT, { height }),
  "window.setSize": () => undefined,
  "window.setFloating": () => undefined,
  "window.isVisible": () => true,
  "window.startDrag": () => undefined,
  "apps.list": () => MOCK_APPS,
  "apps.running": () => [],
  "apps.frontmost": () => null,
  "apps.previous": () => null,
  "apps.defaultForPath": () => null,
  "apps.forUrl": ({ url }) => (/^https?:/i.test(url) ? MOCK_APPS.filter((app) => ["com.apple.Safari", "com.google.Chrome", "org.mozilla.firefox", "company.thebrowser.Browser"].includes(app.bundleId ?? "")) : []),
  "open.url": ({ url }) => {
    window.open(url, "_blank", "noopener");
  },
  "clipboard.read": () => null,
  "clipboard.write": async ({ content }) => {
    const text = content.kind === "text" ? content.text : content.kind === "file" ? content.paths.join("\n") : content.kind === "color" ? content.hex : "";
    if (text) await navigator.clipboard?.writeText(text).catch(() => undefined);
  },
  "input.paste": async ({ content }) => {
    await fallbacks["clipboard.write"]!({ content }, undefined as never);
    dispatch(DEV_HUD_EVENT, { text: "Pasted (browser: copied to clipboard)" });
  },
  "input.selectedText": () => null,
  "input.selectedFinderItems": () => [],
  "system.appearance": () => (window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark"),
  "hud.show": ({ text }) => dispatch(DEV_HUD_EVENT, { text }),
  "confetti.show": () => dispatch(DEV_HUD_EVENT, { text: "🎉" }),
  "hotkeys.record": () => null,
  "hotkeys.register": () => ({ ok: true }),
  "hotkeys.unregister": () => undefined,
  "permissions.status": () => Object.fromEntries(PERMISSIONS.map((p) => [p, "granted" as PermissionStatus])) as Record<PermissionKind, PermissionStatus>,
  "permissions.request": () => "granted",
  "permissions.openSettings": () => undefined,
};

export async function browserNativeCall<M extends NativeMethod>(method: M, params: NativeParams<M> | undefined, events: Emitter<NativeEvents>): Promise<NativeResult<M>> {
  const impl = fallbacks[method] as ((p: NativeParams<M> | undefined, e: Emitter<NativeEvents>) => NativeResult<M> | Promise<NativeResult<M>>) | undefined;
  if (getEnv().dev) console.debug(`[native:browser] ${method}`, params ?? "");
  if (!impl) throw new RpcError({ code: RpcErrorCode.NativeUnavailable, message: `${method} needs the Surgecast app (not available in the browser)` });
  return impl(params, events);
}
