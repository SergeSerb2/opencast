import { afterEach, expect, it } from "vitest";
import type { ScreenInfo } from "@surgecast/protocol";
import type { HostSession } from "../../src/services/extensions/sessions";
import { harness } from "./helpers";
let h: ReturnType<typeof harness>;
afterEach(async () => { await h?.close(); });
const session = { extension: { name: "fixture" } } as HostSession;
const primary: ScreenInfo = {
  id: 1, name: "Primary", frame: { x: 0, y: 0, width: 1440, height: 900 },
  visibleFrame: { x: 0, y: 40, width: 1440, height: 835 }, scale: 2, isMain: true,
};
function setup(frame: ScreenInfo["frame"], screens = [primary]) {
  h = harness();
  h.nativeCalls.mockImplementation(async (method): Promise<any> => {
    if (method === "windows.focused") return { app: { name: "Example", path: "/Applications/Example.app" }, title: "Example", frame };
    if (method === "windows.screens") return screens;
  });
  return (method: string, params = {}) => h.host.broker.request(session, method, params);
}
it("preserves absolute AX bounds in points on a single display", async () => {
  const request = setup({ x: 100, y: 125, width: 800, height: 600 });
  expect(await request("getActiveWindow")).toMatchObject({ window: {
    bounds: { position: { x: 100, y: 125 }, size: { width: 800, height: 600 } },
  } });
});
it.each([
  { x: -1200, y: 0 }, // A display to the left.
  { x: 0, y: 900 }, // A display above the primary: negative AX y.
  { x: 1440, y: -800 }, // A display below/right of the primary.
])("derives a display without screenId and normalizes partial changes (%j)", async ({ x, y }) => {
  const secondary: ScreenInfo = {
    id: 2, name: "Secondary", frame: { x, y, width: 1200, height: 800 },
    visibleFrame: { x, y: y + 20, width: 1200, height: 750 }, scale: 1, isMain: false,
  };
  // Screen top in AX points = primary top - Cocoa visible top.
  const top = 900 - (y + 20 + 750);
  const frame = { x: x + 120, y: top + 150, width: 600, height: 300 };
  const request = setup(frame, [primary, secondary]);
  expect(await request("getActiveWindow")).toMatchObject({ window: {
    bounds: { position: { x: frame.x, y: frame.y }, size: { width: 600, height: 300 } },
  } });
  await request("setWindowBounds", { id: "active", bounds: { size: { width: 480 } } });
  expect(h.nativeCalls).toHaveBeenLastCalledWith("windows.applyLayout", {
    rect: { x: 0.1, y: 0.2, width: 0.4, height: 0.4 }, gap: 0,
  });
  await request("setWindowBounds", { id: "active", bounds: { position: { y: top + 75 } } });
  expect(h.nativeCalls).toHaveBeenLastCalledWith("windows.applyLayout", {
    rect: { x: 0.1, y: 0.1, width: 0.5, height: 0.4 }, gap: 0,
  });
});
it("selects the display with greatest overlap for a straddling window", async () => {
  const secondary: ScreenInfo = { ...primary, id: 2, frame: { ...primary.frame, x: 1440 }, visibleFrame: { ...primary.visibleFrame, x: 1440 } };
  const request = setup({ x: 1200, y: 100, width: 800, height: 500 }, [primary, secondary]);
  await request("setWindowBounds", { id: "active", bounds: { position: { x: 1440, y: 25 } } });
  expect(h.nativeCalls).toHaveBeenLastCalledWith("windows.applyLayout", {
    rect: { x: 0, y: 0, width: 800 / 1440, height: 500 / 835 }, gap: 0,
  });
});
