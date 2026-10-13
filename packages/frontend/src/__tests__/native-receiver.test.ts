import { describe, expect, it, vi } from "vitest";
import type { NativeReceiver } from "../bridge/native";

describe("native receiver", () => {
  it("replays events the host queued before the page installed its receiver", async () => {
    // What the Swift host injects at document start (WebViewBridge.listeners), after it
    // already received a route while the page's modules had not run yet.
    const route = { kind: "settings", route: "ai" } as const;
    window.__surgecastNative = { pending: [["window.route", route]], emit: () => undefined, on: () => () => undefined } as unknown as NativeReceiver;

    vi.resetModules();
    const { installNativeReceiver, native } = await import("../bridge/native");
    installNativeReceiver();
    const onRoute = vi.fn();
    native.on("window.route", onRoute);
    await Promise.resolve();
    expect(onRoute).toHaveBeenCalledWith(route);

    const later = { kind: "settings", route: "cloud-sync" } as const;
    window.__surgecastNative?.emit("window.route", later);
    expect(onRoute).toHaveBeenLastCalledWith(later);
  });

  it("replays a route that arrived before the first subscriber", async () => {
    window.__surgecastNative = undefined;
    vi.resetModules();
    const { installNativeReceiver, native } = await import("../bridge/native");
    installNativeReceiver();
    const route = { kind: "settings", route: "cloud-sync" } as const;
    (window.__surgecastNative as NativeReceiver | undefined)?.emit("window.route", route);

    const onRoute = vi.fn();
    native.on("window.route", onRoute);
    await Promise.resolve();
    expect(onRoute).toHaveBeenCalledTimes(1);
    expect(onRoute).toHaveBeenCalledWith(route);

    const later = vi.fn();
    native.on("window.route", later);
    await Promise.resolve();
    expect(later).not.toHaveBeenCalled();
  });
});
