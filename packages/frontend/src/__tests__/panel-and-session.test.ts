import { describe, expect, it } from "vitest";
import type { ExtensionSessionState, UINode } from "@opencast/protocol";
import { resolveLevels } from "../components/ActionPanel/ActionPanelPopover";
import type { ActionPanelModel } from "../components/actions/model";
import { nextLayers } from "../extension-renderer/ExtensionSessionView";

const model = (labels: string[]): ActionPanelModel => ({
  title: "Item",
  sections: [{ actions: [{ id: "open", title: "Open" }, { id: "move", title: "Move To", submenu: { sections: [{ actions: labels.map((l) => ({ id: l, title: l })) }] } }] }],
});

describe("action panel submenu path", () => {
  it("resolves the open submenu against updated models", () => {
    expect(resolveLevels(model(["Inbox"]), ["move"]).map((l) => l.title)).toEqual(["Item", "Move To"]);
    const updated = resolveLevels(model(["Inbox", "Archive"]), ["move"]);
    expect(updated[1].sections[0].actions.map((a) => a.id)).toEqual(["Inbox", "Archive"]);
    expect(resolveLevels(model([]), ["gone"])).toHaveLength(1);
    expect(resolveLevels(null, [])).toEqual([]);
  });
});

describe("extension session layers", () => {
  const root = (id: string): UINode => ({ type: "List", id, props: {}, children: [] });
  const state = (depth: number, id: string): ExtensionSessionState => ({ sessionId: "s", extensionName: "e", commandName: "c", mode: "view", root: root(id), depth, isLoading: false });

  it("pushes, replaces and pops layers by depth", () => {
    let layers = nextLayers([], state(1, "list"));
    layers = nextLayers(layers, state(2, "detail"));
    expect(layers.map((l) => l.root.id)).toEqual(["list", "detail"]);
    layers = nextLayers(layers, state(2, "detail-2"));
    expect(layers.map((l) => l.root.id)).toEqual(["list", "detail-2"]);
    layers = nextLayers(layers, state(1, "list-updated"));
    expect(layers.map((l) => l.root.id)).toEqual(["list-updated"]);
    expect(nextLayers(layers, { ...state(1, "x"), root: null })).toBe(layers);
  });
});
