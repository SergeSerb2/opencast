import { describe, expect, it } from "vitest";
import type { RootSearchItem, RootSearchResult } from "@surgecast/protocol";
import { buildRootSections, CALCULATOR_ID, commandDeeplink, rootAccessories } from "../launcher/root/root-items";
import { launcherContentHeight, shouldPopToRoot } from "../launcher/useLauncherBehavior";
import { useNavigationStore } from "../launcher/navigation";

const item = (over: Partial<RootSearchItem>): RootSearchItem => ({ id: "builtin:clipboard.history", kind: "builtin", title: "Clipboard History", typeLabel: "Command", icon: "clipboard-16", mode: "view", enabled: true, ...over });

describe("root search rows", () => {
  it("orders accessories alias → hotkey → type label, apps show hotkeys only when selected", () => {
    expect(rootAccessories(item({ alias: "cl", hotkey: { modifiers: ["cmd"], key: "v" } }))).toEqual([{ alias: "cl" }, { shortcut: { modifiers: ["cmd"], key: "v" }, onlyWhenSelected: false }, { text: "Command" }]);
    expect(rootAccessories(item({ kind: "app", typeLabel: "Application", hotkey: { modifiers: ["opt"], key: "s" } }))[0]).toMatchObject({ onlyWhenSelected: true });
  });

  it("builds calculator, result and fallback sections", () => {
    const result: RootSearchResult = {
      query: "2+2",
      calculator: { input: "2+2", interpreted: "2+2", result: "4", copyValue: "4", kind: "math" },
      sections: [{ id: "results", title: "Results", items: [item({ matches: [[0, 1]], running: true })] }],
      fallbacks: [item({ id: "builtin:ai.askAi", title: "Quick AI" })],
    };
    const { sections, rows } = buildRootSections(result, "2+2");
    expect(sections.map((s) => s.title)).toEqual(["Calculator", "Results", "Use “2+2” with…"]);
    expect(sections[0].items[0]).toMatchObject({ id: CALCULATOR_ID, height: 124 });
    expect(sections[1].items[0]).toMatchObject({ titleRanges: [[0, 1]], iconDot: "default" });
    expect(rows.get("fallback:builtin:ai.askAi")?.fallback).toBe(true);
    expect(buildRootSections({ ...result, calculator: undefined }, "").sections.map((s) => s.id)).toEqual(["results"]);
  });

  it("formats deeplinks", () => {
    expect(commandDeeplink(item({}))).toBe("surgecast://extensions/surgecast/clipboard/history");
    expect(commandDeeplink(item({ id: "ext:github.my-prs", kind: "extension", extensionId: "github" }))).toBe("surgecast://extensions/github/github/my-prs");
    expect(commandDeeplink(item({ id: "quicklink:abc", kind: "quicklink" }))).toBe("surgecast://commands/quicklink%3Aabc");
  });
});

describe("launcher window behavior", () => {
  it("pops to root per the timeout setting", () => {
    expect(shouldPopToRoot(-1, 1e9)).toBe(false);
    expect(shouldPopToRoot(0, 0)).toBe(true);
    expect(shouldPopToRoot(90, 89_000)).toBe(false);
    expect(shouldPopToRoot(90, 90_000)).toBe(true);
  });

  it("collapses only in compact mode at an empty root", () => {
    expect(launcherContentHeight("compact", 0, "")).toBe(64);
    expect(launcherContentHeight("compact", 0, "a")).toBe(475);
    expect(launcherContentHeight("compact", 1, "")).toBe(475);
    expect(launcherContentHeight("expanded", 0, "")).toBe(475);
  });

  it("keeps root at the bottom of the navigation stack", () => {
    const nav = useNavigationStore.getState();
    nav.push({ kind: "element", element: null, title: "A" });
    nav.push({ kind: "element", element: null, title: "B" });
    expect(useNavigationStore.getState().stack.map((e) => e.title ?? e.kind)).toEqual(["root", "A", "B"]);
    expect(nav.pop()?.title).toBe("B");
    nav.replaceTop({ kind: "element", element: null, title: "C" });
    expect(useNavigationStore.getState().stack.map((e) => e.title ?? e.kind)).toEqual(["root", "C"]);
    const token = useNavigationStore.getState().rootResetToken;
    nav.popToRoot({ clearSearch: true });
    expect(useNavigationStore.getState().stack).toHaveLength(1);
    expect(useNavigationStore.getState().rootResetToken).toBe(token + 1);
    expect(nav.pop()).toBeUndefined();
  });
});
