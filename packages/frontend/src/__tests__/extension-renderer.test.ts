import { describe, expect, it, vi } from "vitest";
import type { UINode } from "@surgecast/protocol";
import { mapAction, mapActionPanel } from "../extension-renderer/actions";
import { groupSections, mapAccessories, mapDropdownSections, mapGridItem, mapGridLayout, mapListItem, mapMetadata } from "../extension-renderer/mapping";
import { revive } from "../extension-renderer/props";

let n = 0;
const node = (type: string, props: Record<string, unknown> = {}, children: UINode[] = []): UINode => ({ type, id: `${type}#${++n}`, props, children });
const h = (id: string) => ({ $handler: id });

describe("UINode → action panel", () => {
  it("maps sections, defaults, shortcuts and form values", () => {
    const dispatch = vi.fn();
    const panel = node("ActionPanel", { title: "PR" }, [
      node("Action.OpenInBrowser", { url: "https://x", onAction: h("open") }),
      node("ActionPanel.Section", { title: "Copy" }, [node("Action.CopyToClipboard", { content: "x", shortcut: { modifiers: ["cmd"], key: "c" }, onAction: h("copy") })]),
      node("ActionPanel.Submenu", { title: "Labels", onOpen: h("open-menu") }, [node("Action", { title: "bug", onAction: h("bug") })]),
      node("Action.Trash", { paths: ["/a"], onAction: h("trash") }),
    ]);
    const model = mapActionPanel(panel, { dispatch, getFormValues: () => ({ due: new Date("2026-01-02T00:00:00.000Z"), title: "t" }) })!;
    expect(model.title).toBe("PR");
    expect(model.sections.map((s) => s.title)).toEqual([undefined, "Copy", undefined]);
    const [open] = model.sections[0].actions;
    expect(open).toMatchObject({ title: "Open in Browser", icon: "globe-01-16" });
    open.onAction?.();
    expect(dispatch).toHaveBeenCalledWith(h("open"), [{ formValues: { due: { $date: "2026-01-02T00:00:00.000Z" }, title: "t" } }]);
    expect(model.sections[1].actions[0]).toMatchObject({ title: "Copy to Clipboard", shortcut: { modifiers: ["cmd"], key: "c" } });
    const trailing = model.sections[2].actions;
    expect(trailing[0].submenu?.sections[0].actions[0].title).toBe("bug");
    trailing[0].submenu?.onOpen?.();
    expect(dispatch).toHaveBeenCalledWith(h("open-menu"), []);
    expect(trailing[1]).toMatchObject({ title: "Move to Trash", style: "destructive" });
  });

  it("ignores non-action nodes and non-panels", () => {
    expect(mapAction(node("List.Item"), { dispatch: vi.fn() })).toBeNull();
    expect(mapActionPanel(node("List"), { dispatch: vi.fn() })).toBeNull();
    expect(mapActionPanel(undefined, { dispatch: vi.fn() })).toBeNull();
  });
});

describe("UINode → list/grid props", () => {
  it("maps list items with accessories, detail and ids", () => {
    const dispatch = vi.fn();
    const item = node("List.Item", {
      id: "pr-1",
      title: { value: "Fix", tooltip: "Full title" },
      subtitle: "#1",
      icon: "circle-16",
      keywords: ["a", 3],
      accessories: [{ date: { $date: "2026-03-01T10:00:00.000Z" } }, { text: "12", icon: "speech-bubble-16" }],
      detail: node("List.Item.Detail", { markdown: "# Hi", metadata: node("List.Item.Detail.Metadata", {}, [node("List.Item.Detail.Metadata.Label", { title: "Repo", text: "x" })]) }),
      actions: node("ActionPanel", {}, [node("Action", { title: "Go", onAction: h("go") })]),
    });
    const mapped = mapListItem(item, { dispatch });
    expect(mapped.id).toBe("pr-1");
    expect(mapped.title).toEqual({ value: "Fix", tooltip: "Full title" });
    expect(mapped.keywords).toEqual(["a"]);
    expect(mapped.accessories?.[0].date).toBeInstanceOf(Date);
    expect(mapped.detailProps?.markdown).toBe("# Hi");
    expect(mapped.detailProps?.metadata).toEqual([{ kind: "label", title: "Repo", text: "x", color: undefined, icon: undefined }]);
    expect(mapped.actions?.sections[0].actions[0].title).toBe("Go");
    expect(mapListItem(node("List.Item", { title: "x" }), { dispatch }).id).toMatch(/^List\.Item#/);
  });

  it("groups loose items and sections", () => {
    const root = node("List", {}, [node("List.Item", { title: "a" }), node("List.Section", { title: "S" }, [node("List.Item", { title: "b" })]), node("List.EmptyView")]);
    const groups = groupSections(root, "List.Section", "List.Item");
    expect(groups.map((g) => [g.node?.props.title ?? null, g.items.length])).toEqual([
      [null, 1],
      ["S", 1],
    ]);
  });

  it("maps grid layout and items", () => {
    expect(mapGridLayout({ itemSize: "small" })).toMatchObject({ columns: 8 });
    expect(mapGridLayout({ columns: 4, aspectRatio: "3/2", fit: "fill", inset: "small" })).toEqual({ columns: 4, aspectRatio: "3/2", fit: "fill", inset: "small" });
    expect(mapGridLayout({ aspectRatio: "5/4", columns: 20 })).toMatchObject({ aspectRatio: undefined, columns: 8 });
    const item = mapGridItem(node("Grid.Item", { content: { color: "#f00" }, title: "Red", accessory: { icon: "star-16", tooltip: "fav" } }), { dispatch: vi.fn() });
    expect(item).toMatchObject({ content: { color: "#f00" }, title: "Red", accessory: { icon: "star-16", tooltip: "fav" } });
  });

  it("maps metadata, dropdowns and revives dates", () => {
    const dispatch = vi.fn();
    const metadata = mapMetadata(
      node("Detail.Metadata", {}, [
        node("Detail.Metadata.Label", { title: "Status", text: { value: "Open", color: "raycast-green" } }),
        node("Detail.Metadata.TagList", { title: "Tags" }, [node("Detail.Metadata.TagList.Item", { text: "a", onAction: h("tag") })]),
        node("Detail.Metadata.Separator"),
        node("Detail.Metadata.Link", { title: "URL", text: "x", target: "https://x" }),
      ]),
      dispatch,
    )!;
    expect(metadata.map((e) => e.kind)).toEqual(["label", "tags", "separator", "link"]);
    expect(metadata[0]).toMatchObject({ text: "Open", color: "raycast-green" });
    const tags = metadata[1] as Extract<(typeof metadata)[number], { kind: "tags" }>;
    tags.tags[0].onAction?.();
    expect(dispatch).toHaveBeenCalledWith(h("tag"), []);
    const sections = mapDropdownSections(node("List.Dropdown", {}, [node("List.Dropdown.Item", { title: "All", value: "all" }), node("List.Dropdown.Section", { title: "S" }, [node("List.Dropdown.Item", { title: "One", value: "1" })])]));
    expect(sections).toEqual([
      { items: [{ value: "all", title: "All", icon: undefined, keywords: undefined }] },
      { title: "S", items: [{ value: "1", title: "One", icon: undefined, keywords: undefined }] },
    ]);
    expect(revive({ a: [{ $date: "2026-01-01T00:00:00.000Z" }], b: { $handler: "x" } }).a[0]).toBeInstanceOf(Date);
    expect(mapAccessories("nope")).toBeUndefined();
  });
});
