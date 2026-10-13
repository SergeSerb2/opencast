import { describe, it, expect, afterEach, vi } from "vitest";
import React, { useState, useEffect, useRef } from "react";
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as api from "../src/index";
import { configure, initialization, dispatch } from "../src/bridge";
import { ExtensionRenderer, serialize } from "../src/renderer";
import type { UINode } from "@opencast/protocol";
const renderers: ExtensionRenderer[] = [];
const h = React.createElement;
async function tick() { await new Promise((resolve) => setTimeout(resolve, 50)); }
function mount(element: React.ReactNode) {
  let tree: UINode | null = null; let depth = 0;
  const renderer = new ExtensionRenderer((root, nextDepth) => { tree = root; depth = nextDepth; }); renderers.push(renderer); renderer.render(element);
  return { renderer, get tree() { return tree!; }, get depth() { return depth; } };
}
function nodes(node: UINode): UINode[] { return [node, ...node.children.flatMap(nodes), ...Object.values(node.props).filter((x: any) => x?.type && x?.children).flatMap((x) => nodes(x as UINode))]; }
afterEach(() => { for (const renderer of renderers.splice(0)) renderer.dispose(); });
describe("UI contract", () => {
  it("serializes nested callbacks, dates and asset paths; rejects cycles", () => {
    configure({ ...initialization, assetsPath: tmpdir() }, vi.fn(), vi.fn());
    const date = new Date("2025-01-02T00:00:00Z"); const fn = vi.fn();
    const result = serialize([{ type: "List", props: { id: "list", pagination: { onLoadMore: fn }, date, undefined: undefined }, children: [] }]);
    expect(result.root?.props).toEqual({ id: "list", pagination: { onLoadMore: { $handler: "list.pagination.onLoadMore" } }, date: { $date: date.toISOString() } });
    expect(result.handlers.get("list.pagination.onLoadMore")).toBe(fn);
    const circular: any = {}; circular.value = circular;
    expect(() => serialize([{ type: "Detail", props: { circular }, children: [] }])).toThrow("Circular");
  });
  it("renders List items, details, actions and nested prop elements", async () => {
    const view = mount(h(api.List, { searchBarAccessory: h(api.List.Dropdown, { tooltip: "Choose" }, h(api.List.Dropdown.Item, { title: "All", value: "all" })) }, h(api.List.Section, { title: "Items" }, h(api.List.Item, { id: "first", title: "First", detail: h(api.List.Item.Detail, { markdown: "Body", metadata: h(api.List.Item.Detail.Metadata, {}, h(api.List.Item.Detail.Metadata.Label, { title: "Value", text: "One" })) }), actions: h(api.ActionPanel, {}, h(api.Action.CopyToClipboard, { content: "first" })) }))));
    await tick();
    expect(view.tree.type).toBe("List"); expect((view.tree.props.searchBarAccessory as UINode).type).toBe("List.Dropdown");
    const item = nodes(view.tree).find((x) => x.type === "List.Item")!; expect(item.id).toBe("first");
    expect((item.props.detail as UINode).props.markdown).toBe("Body");
    expect(nodes(view.tree).find((x) => x.type === "Action.CopyToClipboard")?.props.onAction).toHaveProperty("$handler");
  });
  it("renders Form and Detail samples, refs, date events and submit values", async () => {
    const requests = vi.fn(async () => undefined); configure({ ...initialization }, requests, vi.fn());
    const ref = React.createRef<any>(); const submit = vi.fn();
    const date = new Date("2025-05-01");
    const view = mount(h(api.Form, { actions: h(api.ActionPanel, {}, h(api.Action.SubmitForm, { onSubmit: submit })) }, h(api.Form.TextField, { id: "name", title: "Name", defaultValue: "Example", ref }), h(api.Form.DatePicker, { id: "date", value: date })));
    await tick(); expect(view.tree.type).toBe("Form");
    expect(nodes(view.tree).find((x) => x.type === "Form.DatePicker")?.props.value).toEqual({ $date: date.toISOString() });
    await ref.current.focus(); expect(requests).toHaveBeenCalledWith("formSetFocus", { itemId: "name" });
    const action = nodes(view.tree).find((x) => x.type === "Action.SubmitForm")!;
    await dispatch((action.props.onAction as any).$handler, [{ formValues: { name: "Entered", date: { $date: date.toISOString() } } }]);
    expect(submit).toHaveBeenCalledWith({ name: "Entered", date });
    const detail = mount(h(api.Detail, { markdown: "# Example", metadata: h(api.Detail.Metadata, {}, h(api.Detail.Metadata.Link, { title: "Web", target: "https://example.com", text: "Example" })) }));
    await tick(); expect(detail.tree.props.markdown).toBe("# Example"); expect(nodes(detail.tree).some((x) => x.type === "Detail.Metadata.Link")).toBe(true);
  });
  it("runs built-in action behavior before the extension callback", async () => {
    const calls: string[] = [];
    configure({ ...initialization }, async (method) => { calls.push(method); }, vi.fn());
    const view = mount(h(api.Detail, { actions: h(api.ActionPanel, {}, h(api.Action.CopyToClipboard, { content: "Copied", onCopy: () => calls.push("onCopy") })) }));
    await tick(); const action = nodes(view.tree).find((x) => x.type === "Action.CopyToClipboard")!;
    await dispatch((action.props.onAction as any).$handler, [{}]);
    expect(calls).toEqual(["setClipboard", "onCopy", "closeMainRaycastWindow", "showHUD"]);
  });
  it("keeps lower navigation views mounted, preserves state, calls onPop once", async () => {
    let rootUnmounts = 0; const onPop = vi.fn();
    function Child() { const { pop } = api.useNavigation(); return h(api.Detail, { markdown: "Child", actions: h(api.ActionPanel, {}, h(api.Action, { title: "Pop", onAction: pop })) }); }
    function Root() { const [count, setCount] = useState(0); useEffect(() => () => { rootUnmounts++; }, []); return h(api.Detail, { markdown: String(count), actions: h(api.ActionPanel, {}, h(api.Action, { title: "Increment", onAction: () => setCount((x) => x + 1) }), h(api.Action.Push, { title: "Push", target: h(Child), onPop })) }); }
    const view = mount(h(Root)); await tick();
    let actions = nodes(view.tree).filter((x) => x.type.startsWith("Action") && x.props.onAction);
    await dispatch((actions[0].props.onAction as any).$handler); await tick(); expect(view.tree.props.markdown).toBe("1");
    actions = nodes(view.tree).filter((x) => x.type.startsWith("Action") && x.props.onAction);
    await dispatch((actions[1].props.onAction as any).$handler); await tick(); expect(view.depth).toBe(2); expect(view.tree.props.markdown).toBe("Child"); expect(rootUnmounts).toBe(0);
    expect(view.renderer.pop()).toBe(false); await tick(); expect(view.depth).toBe(1); expect(view.tree.props.markdown).toBe("1"); expect(onPop).toHaveBeenCalledOnce();
    expect(view.renderer.pop()).toBe(true);
  });

  it("initializes dropdowns and mounts only the selected item's detail", async () => {
    const changed = vi.fn(); const detailMounts: string[] = [];
    function ItemDetail({ name }: { name: string }) { useEffect(() => { detailMounts.push(name); }, []); return h(api.List.Item.Detail, { markdown: name }); }
    const view = mount(h(api.List, { searchBarAccessory: h(api.List.Dropdown, { tooltip: "Size", onChange: changed }, h(api.List.Dropdown.Item, { title: "First", value: "first" })) },
      h(api.List.Item, { id: "one", title: "One", detail: h(ItemDetail, { name: "one" }) }), h(api.List.Item, { id: "two", title: "Two", detail: h(ItemDetail, { name: "two" }) })));
    await tick(); expect(changed).toHaveBeenCalledWith("first"); expect(detailMounts).toEqual(["one"]);
    await dispatch((view.tree.props.onSelectionChange as any).$handler, ["two"]); await tick(); expect(detailMounts).toEqual(["one", "two"]);
    expect(view.tree.children[0].props.detail).toBeUndefined(); expect((view.tree.children[1].props.detail as UINode).props.markdown).toBe("two");
  });
  it("uses stable menu callback IDs across fresh mounts", async () => {
    const element = h(api.MenuBarExtra, { title: "Status" }, h(api.MenuBarExtra.Item, { title: "Run", onAction: vi.fn() }));
    const first = mount(element); await tick(); const second = mount(element); await tick();
    expect(first.tree.children[0].props.onAction).toEqual(second.tree.children[0].props.onAction);
  });
});
describe("API services", () => {
  it("reads an existing extension cache without moving its SQLite files", () => {
    const directory = mkdtempSync(join(tmpdir(), "opencast-cache-upgrade-"));
    const legacy = join(directory, "com.surgecast.api.cache");
    mkdirSync(legacy);
    const db = new DatabaseSync(join(legacy, "cache.sqlite"));
    db.exec("CREATE TABLE cache (namespace TEXT, key TEXT, value TEXT NOT NULL, touched INTEGER NOT NULL, PRIMARY KEY(namespace,key)); INSERT INTO cache VALUES ('a', 'saved', 'keep', 1)");
    db.close();
    const cache = new api.Cache({ directory, namespace: "a" });
    expect(cache.get("saved")).toBe("keep");
    cache.set("new", "value");
    expect(new api.Cache({ directory, namespace: "a" }).get("new")).toBe("value");
    expect(existsSync(join(legacy, "cache.sqlite"))).toBe(true);
  });
  it("exports all named runtime values and every public icon/model enum key", () => {
    const declarations = readFileSync(new URL("../public-api.d.ts", import.meta.url), "utf8");
    const names = new Set([...declarations.matchAll(/^\s*export declare (?:const|class|enum|function|namespace) (\w+)/gm)].map((m) => m[1]));
    for (const name of names) expect(api, name).toHaveProperty(name);
    expect(Object.keys(api.Icon)).toHaveLength(478); expect(Object.keys(api.AI.Model)).toHaveLength(176);
  });
  it("persists Cache namespaces, evicts LRU by UTF8 bytes and notifies subscribers", () => {
    const directory = mkdtempSync(join(tmpdir(), "opencast-cache-test-"));
    const cache = new api.Cache({ directory, namespace: "a", capacity: 6 }); const notify = vi.fn(); const subscribe = cache.subscribe; const unsubscribe = subscribe(notify);
    cache.set("first", "é"); cache.set("second", "bb"); cache.get("first"); cache.set("third", "ccc");
    expect(cache.get("second")).toBeUndefined(); expect(cache.get("first")).toBe("é");
    const another = new api.Cache({ directory, namespace: "a", capacity: 6 }); expect(another.get("first")).toBe("é");
    expect(new api.Cache({ directory, namespace: "b" }).isEmpty).toBe(true);
    cache.clear(); expect(notify).toHaveBeenLastCalledWith(undefined, undefined); unsubscribe();
  });
  it("streams AI text, awaits concatenation and cancels the backend request", async () => {
    const { dispatch } = await import("../src/bridge"); const notifications = vi.fn();
    configure({ ...initialization, aiAvailable: true }, async (_method, p) => { await new Promise((resolve) => setTimeout(resolve, 5)); await dispatch(String(p!.streamCallbackId), [{ value: "One" }]); await dispatch(String(p!.streamCallbackId), [{ value: "Two" }]); return {}; }, notifications);
    const chunks: string[] = []; const result = api.AI.ask("Prompt"); result.on("data", (x) => chunks.push(x)); expect(await result).toBe("OneTwo"); expect(chunks).toEqual(["One", "Two"]);
    configure({ ...initialization }, () => new Promise(() => {}), notifications);
    const controller = new AbortController(); const cancelled = api.AI.ask("Prompt", { signal: controller.signal }); controller.abort(); await expect(cancelled).rejects.toThrow("aborted"); expect(notifications).toHaveBeenCalledWith("cancelAI", expect.anything());
  });
  it("normalizes OAuth tokens and expires them ten seconds early", () => {
    const token = new api.OAuth.TokenSet({ access_token: "sample", refresh_token: "refresh", expires_in: 60, scope: ["a", "b"], updatedAt: new Date(Date.now() - 51000).toISOString() });
    expect(token.accessToken).toBe("sample"); expect(token.scope).toBe("a b"); expect(token.isExpired()).toBe(true);
    expect(new api.OAuth.TokenSet({ accessToken: "sample" }).isExpired()).toBe(false);
  });
  it("creates PKCE requests with explicit provider client identity and local redirect", async () => {
    const requests = vi.fn(async () => ({ state: "random-state", redirectURI: "surgecast://oauth" })); configure({ ...initialization }, requests, vi.fn());
    const client = new api.OAuth.PKCEClient({ redirectMethod: "app", providerName: "Example" });
    const auth = await client.authorizationRequest({ endpoint: "https://example.com/auth", clientId: "own-client", scope: "read" });
    expect(auth.codeVerifier).toHaveLength(43); expect(auth.codeChallenge).toHaveLength(43);
    const url = new URL(auth.toURL()); expect(url.searchParams.get("redirect_uri")).toBe("surgecast://oauth"); expect(url.searchParams.get("client_id")).toBe("own-client");
    expect(api.OAuth.clientIdMetadataDocument).toBe("surgecast://oauth-client-metadata");
  });
});
