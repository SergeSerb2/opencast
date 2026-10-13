import { beforeAll, afterEach, describe, it, expect, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { harness, fixture, waitFor } from "./helpers";
import { archiveEntries, crc32 } from "../../src/services/extensions/archive";
import { parseInterval, validateManifest } from "../../src/services/extensions/manifest";
import { ExtensionScheduler } from "../../src/services/extensions/scheduler";
import { resolveModel } from "../../src/services/extensions/broker";
beforeAll(() => execFileSync(process.execPath, ["build.mjs"], { cwd: resolve("../raycast-api"), stdio: "pipe" }));
const contexts: ReturnType<typeof harness>[] = [];
function setup() { const h = harness(); contexts.push(h); return h; }
afterEach(async () => { for (const h of contexts.splice(0)) await h.close(); });
function treeNodes(node: any): any[] { return [node, ...node.children.flatMap(treeNodes), ...Object.values(node.props).filter((x: any) => x?.type && x?.children).flatMap(treeNodes)]; }
describe("extension host", () => {
  it("isolates command passwords while sharing inherited extension passwords", async () => {
    const h = setup();
    await h.call("extensions.install", { source: "local", path: fixture(h.dataDir, {
      preferences: [{ name: "shared", type: "password" }],
      commands: ["a", "b"].map(name => ({ name, title: name, mode: "no-view", preferences: [{ name: "token", type: "password" }] })),
    }) });
    await h.call("extensions.setPreferences", { name: "fixture", command: "a", values: { token: "value-a", shared: "shared-value" } });
    await h.call("extensions.setPreferences", { name: "fixture", command: "b", values: { token: "value-b" } });
    expect(await h.call("extensions.getPreferences", { name: "fixture", command: "a" })).toMatchObject({ values: { token: "value-a", shared: "shared-value" } });
    expect(await h.call("extensions.getPreferences", { name: "fixture", command: "b" })).toMatchObject({ values: { token: "value-b", shared: "shared-value" } });
    await h.call("extensions.uninstall", { name: "fixture" });
    expect(h.secrets.size).toBe(0);
  });

  it.each([false, true])("keeps local files and metadata aligned after sync (legacy install: %s)", async legacy => {
    const h = setup(); await h.call("extensions.install", { source: "local", path: fixture(h.dataDir, { version: "v1" }) });
    const original = h.host.installer.get("fixture");
    if (legacy) h.ctx.entities.put("localState", "ext:fixture:install", { path: original.path });
    const record = h.ctx.entities.get("extensions", "fixture")!;
    h.ctx.entities.applyRemote("extensions", "fixture", { data: { ...original, source: "store", version: "v2", commands: [{ name: "new", title: "New", mode: "no-view" }] }, createdAt: record.createdAt, updatedAt: record.updatedAt + 1, deleted: false }, 1);
    expect(h.host.installer.get("fixture").version).toBe("v1");
    expect((await h.ctx.commands.all()).map(c => c.id)).toEqual(["ext:fixture.list", "ext:fixture.task"]);
    // The updater must compare the files' version, even when desired metadata is current.
    h.ctx.entities.patch("extensions", "fixture", { source: "store" });
    const device = h.ctx.entities.get<any>("localState", "ext:fixture:install")!.data;
    h.ctx.entities.put("localState", "ext:fixture:install", { ...device, installed: { ...original, source: "store" } });
    vi.spyOn(h.host.installer.store, "raw").mockResolvedValue({ version: "v2" } as any);
    const install = vi.spyOn(h.host.installer, "install").mockResolvedValue({ ...original, version: "v2" });
    expect(await h.call("extensions.update", { name: "fixture" })).toEqual({ updated: ["fixture"] });
    expect(install).toHaveBeenCalled();
  });

  it("installs locally, exposes commands, dispatches search and actions, closes at root", async () => {
    const h = setup(); const path = fixture(h.dataDir); const installed = await h.call("extensions.install", { source: "local", path }) as any;
    expect(installed.path).toBe(join(h.dataDir, "extensions", "fixture"));
    expect(h.ctx.entities.get<any>("extensions", "fixture")?.data.path).toBeUndefined();
    const commands = await h.ctx.commands.all(); expect(commands.map((x) => x.id)).toEqual(["ext:fixture.list", "ext:fixture.task"]);
    const launch = await h.call("ext.session.start", { name: "fixture", command: "list" }) as any;
    const session = h.host.sessions.get(launch.sessionId);
    await waitFor(() => session.state.root ?? undefined);
    const id = (session.state.root!.props.onSearchTextChange as any).$handler;
    await h.call("ext.session.dispatch", { sessionId: session.id, handlerId: id, args: ["Search"] });
    await waitFor(() => session.state.root?.children[0].props.title === "Search" ? true : undefined);
    const action = treeNodes(session.state.root).find((x) => x.type === "Action");
    await h.call("ext.session.dispatch", { sessionId: session.id, handlerId: action.props.onAction.$handler, args: [{}] });
    await waitFor(() => session.state.root?.children[0].props.title === "Action" ? true : undefined);
    await expect(h.call("ext.session.pop", { sessionId: session.id })).resolves.toEqual({ closed: true });
    expect(h.host.sessions.sessions.size).toBe(0);
  });
  it("awaits no-view commands and shares LocalStorage across commands, independently of sync", async () => {
    const h = setup(); await h.call("extensions.install", { source: "local", path: fixture(h.dataDir) });
    expect(await h.call("ext.session.start", { name: "fixture", command: "task" })).toEqual({ kind: "done", closeWindow: false });
    expect(h.ctx.db.get<any>("SELECT value FROM extension_storage WHERE extension='fixture' AND key='ran'")?.value).toBe("true");
    expect(h.ctx.entities.dirty().some((x) => x.collection.includes("storage"))).toBe(false);
    expect(h.host.sessions.sessions.size).toBe(0);
  });
  it("returns a preferences view, merges scoped prefs, keeps passwords only in Keychain", async () => {
    const h = setup(); const path = fixture(h.dataDir, { preferences: [{ name: "password", type: "password", required: true }, { name: "color", type: "dropdown", data: [{ title: "Blue", value: "blue" }], default: { macOS: "blue" } }], commands: [{ name: "task", title: "Task", mode: "no-view", preferences: [{ name: "amount", type: "textfield", default: "one" }] }] });
    await h.call("extensions.install", { source: "local", path });
    const result = await h.call("ext.session.start", { name: "fixture", command: "task" }) as any; expect(result.view.id).toBe("extension.preferences");
    expect(h.host.sessions.sessions.size).toBe(0);
    await h.call("extensions.setPreferences", { name: "fixture", values: { password: "sample-password" } });
    await h.call("extensions.setPreferences", { name: "fixture", command: "task", values: { amount: "two" } });
    expect(await h.call("extensions.getPreferences", { name: "fixture", command: "task" })).toEqual({ values: { password: "sample-password", color: "blue", amount: "two" }, missingRequired: [] });
    expect(h.secrets.get("ext:fixture:pref:password")).toBe("sample-password");
    expect(JSON.stringify(h.ctx.entities.dirty())).not.toContain("sample-password");
    await expect(h.call("extensions.setPreferences", { name: "fixture", values: { color: "red" } })).rejects.toThrow("Invalid option");
  });

  it("routes remembered password fields to Keychain and clears tracked secrets on uninstall", async () => {
    const h = setup(); await h.call("extensions.install", { source: "local", path: fixture(h.dataDir) });
    const result = await h.call("ext.session.start", { name: "fixture", command: "list" }) as any; const session = h.host.sessions.get(result.sessionId);
    await h.host.broker.request(session, "setFormPassword", { itemId: "login", value: "sample-form-password" });
    expect(await h.host.broker.request(session, "getFormPassword", { itemId: "login" })).toBe("sample-form-password");
    expect(JSON.stringify(h.ctx.entities.dirty())).not.toContain("sample-form-password");
    await h.call("extensions.uninstall", { name: "fixture" }); expect(h.secrets.has("ext:fixture:form:list:login")).toBe(false);
  });
  it("preserves local paths when synced metadata changes and disables installed commands", async () => {
    const h = setup(); await h.call("extensions.install", { source: "local", path: fixture(h.dataDir) });
    const extension = h.host.installer.get("fixture");
    h.ctx.entities.applyRemote("extensions", "fixture", { data: { ...extension, path: "/another/device", title: "Remote", enabled: false }, createdAt: Date.now(), updatedAt: Date.now() + 1000, deleted: false }, 1);
    expect(h.host.installer.get("fixture").path).toBe(join(h.dataDir, "extensions", "fixture"));
    expect((await h.ctx.commands.all()).every((x) => !x.enabled)).toBe(true);
    await expect(h.call("ext.session.start", { name: "fixture", command: "list" })).rejects.toThrow("disabled");
  });
  it("executes tools, validates schemas, recursively resolves result functions and runs confirmation", async () => {
    const h = setup(); const path = fixture(h.dataDir, { tools: [{ name: "lookup", title: "Lookup", description: "Lookup data", input: { type: "object", properties: { query: { type: "string" } }, required: ["query"], additionalProperties: false }, confirmation: true }] });
    mkdirSync(join(path, "tools")); writeFileSync(join(path, "tools/lookup.js"), `exports.confirmation=async({query})=>({message:'Run '+query,style:'destructive'});exports.default=async({query})=>({query,value:async()=>42})`);
    await h.call("extensions.install", { source: "local", path });
    await expect(h.ctx.tools.call("ext:fixture.lookup", {})).rejects.toThrow("Invalid extension tool input");
    expect(await h.ctx.tools.call("ext:fixture.lookup", { query: "sample" })).toEqual({ query: "sample", value: 42 });
    expect(h.nativeCalls).toHaveBeenCalledWith("alert.show", expect.objectContaining({ message: "Run sample" }));
    expect(h.host.sessions.sessions.size).toBe(0);
  });
  it("persists menu trees and redispatches a callback after reloading its worker", async () => {
    const h = setup(); const path = fixture(h.dataDir, { commands: [{ name: "status", title: "Status", mode: "menu-bar" }] }, { status: `const React=require('react');const{MenuBarExtra,LocalStorage}=require('@raycast/api');exports.default=()=>React.createElement(MenuBarExtra,{title:'Status'},React.createElement(MenuBarExtra.Item,{title:'Run',onAction:()=>LocalStorage.setItem('menu',true)}))` });
    await h.call("extensions.install", { source: "local", path }); const launch = await h.call("ext.session.start", { name: "fixture", command: "status" }) as any;
    const session = h.host.sessions.get(launch.sessionId); await waitFor(() => session.state.root ?? undefined);
    const handlerId = (session.state.root!.children[0].props.onAction as any).$handler;
    expect(h.ctx.entities.get("localState", "ext:menu:ext:fixture.status")).toBeDefined();
    await h.host.sessions.close(session.id, "completed", undefined, false);
    h.nativeEvents.emit("menubar.itemClicked", { menuId: "ext:fixture.status", itemId: handlerId });
    await waitFor(() => h.ctx.db.get<any>("SELECT value FROM extension_storage WHERE extension='fixture' AND key='menu'")?.value === "true" ? true : undefined);
    expect(h.nativeCalls.mock.calls.some((x) => x[0] === "menubar.set")).toBe(true);
  });
  it("routes streaming AI to configured engine and aborts in-flight requests on close", async () => {
    const h = setup(); h.ctx.ai.defaultModel = async () => "own/model";
    h.ctx.ai.complete = vi.fn(async (_req, emit) => { emit?.({ type: "text", delta: "Own" }); emit?.({ type: "text", delta: " provider" }); return { text: "Own provider", model: "own/model", toolCalls: [] }; });
    const path = fixture(h.dataDir, { commands: [{ name: "ai", title: "AI", mode: "view" }] }, { ai: `const React=require('react');const{AI,Detail}=require('@raycast/api');exports.default=()=>{const[t,setT]=React.useState('');React.useEffect(()=>{AI.ask('Prompt').on('data',x=>setT(y=>y+x))},[]);return React.createElement(Detail,{markdown:t})}` });
    await h.call("extensions.install", { source: "local", path }); const launch = await h.call("ext.session.start", { name: "fixture", command: "ai" }) as any;
    await waitFor(() => h.host.sessions.get(launch.sessionId).state.root?.props.markdown === "Own provider" ? true : undefined);
    expect(h.ctx.ai.complete).toHaveBeenCalledWith(expect.objectContaining({ purpose: "extension", messages: [{ role: "user", content: "Prompt" }] }), expect.any(Function));
    await h.host.sessions.close(launch.sessionId);
  });
  it.each(["surgecast", "opencast", "raycast"])("keeps the registered OAuth redirect and accepts matching %s callbacks", async scheme => {
    const h = setup(); const path = fixture(h.dataDir); await h.call("extensions.install", { source: "local", path });
    const launch = await h.call("ext.session.start", { name: "fixture", command: "list" }) as any; const session = h.host.sessions.get(launch.sessionId);
    const dispatch = vi.spyOn(h.host.sessions, "dispatch").mockResolvedValue(undefined);
    const flow = await h.host.broker.request(session, "initOAuth", { onRedirect: "callback", providerId: "provider" });
    expect(flow.redirectURI).toBe("surgecast://oauth");
    h.nativeEvents.emit("url.opened", { url: "opencast://oauth?state=wrong&code=other" }); await new Promise((resolve) => setTimeout(resolve, 10)); expect(dispatch).not.toHaveBeenCalled();
    h.nativeEvents.emit("url.opened", { url: `${scheme}://oauth?state=${flow.state}&code=accepted` }); await waitFor(() => dispatch.mock.calls.length ? true : undefined);
    expect(dispatch).toHaveBeenCalledWith(session.id, "callback", [{ authorizationCode: "accepted" }]);
    await h.host.broker.request(session, "setOAuthTokens", { providerId: "provider", tokenSet: { accessToken: "sample-token" } });
    expect(h.secrets.get("oauth:fixture:provider")).toBe('{"accessToken":"sample-token"}'); expect(JSON.stringify(h.ctx.entities.dirty())).not.toContain("sample-token");
  });

  it("shows an error view for an unhandled callback failure and releases the worker", async () => {
    const h = setup(); const path = fixture(h.dataDir, {}, { list: `const React=require('react');const{List}=require('@raycast/api');exports.default=()=>React.createElement(List,{onSearchTextChange:()=>{throw new Error('Callback failed')}})` });
    await h.call("extensions.install", { source: "local", path }); const result = await h.call("ext.session.start", { name: "fixture", command: "list" }) as any;
    const session = h.host.sessions.get(result.sessionId); await waitFor(() => session.state.root ?? undefined);
    await expect(h.call("ext.session.dispatch", { sessionId: session.id, handlerId: (session.state.root!.props.onSearchTextChange as any).$handler, args: ["text"] })).rejects.toThrow("Callback failed");
    await waitFor(() => session.state.root?.type === "Detail" ? true : undefined); expect(session.state.root?.props.markdown).toContain("Callback failed");
    await h.call("ext.session.close", { sessionId: session.id }); expect(h.host.sessions.sessions.size).toBe(0);
  });
  it("keeps the last menu tree when workers stop at shutdown", async () => {
    const h = setup(); const path = fixture(h.dataDir, { commands: [{ name: "status", title: "Status", mode: "menu-bar" }] }, { status: `const React=require('react');const{MenuBarExtra}=require('@raycast/api');exports.default=()=>React.createElement(MenuBarExtra,{title:'Saved'})` });
    await h.call("extensions.install", { source: "local", path }); const result = await h.call("ext.session.start", { name: "fixture", command: "status" }) as any;
    await waitFor(() => h.host.sessions.get(result.sessionId).state.root ?? undefined); await h.host.sessions.shutdown();
    expect(h.ctx.entities.get<any>("localState", "ext:menu:ext:fixture.status")?.data.root.props.title).toBe("Saved");
  });
  it("develop watches built files, reloads sessions, and never deletes developer sources", async () => {
    const h = setup(); const path = fixture(h.dataDir); await h.call("extensions.develop", { path });
    const launch = await h.call("ext.session.start", { name: "fixture", command: "list" }) as any;
    writeFileSync(join(path, "list.js"), `const React=require('react');const{Detail}=require('@raycast/api');exports.default=()=>React.createElement(Detail,{markdown:'Rebuilt'})`);
    await waitFor(() => [...h.host.sessions.sessions.values()].find((x) => x.id !== launch.sessionId && x.state.root?.props.markdown === "Rebuilt"), 5000);
    await h.call("extensions.uninstall", { name: "fixture" }); expect(readFileSync(join(path, "package.json"), "utf8")).toContain("fixture");
  });
});
function zip(entries: { name: string; data?: string; mode?: number }[]): Buffer {
  const local: Buffer[] = [], directory: Buffer[] = []; let offset = 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name), data = Buffer.from(entry.data ?? "");
    const head = Buffer.alloc(30); head.writeUInt32LE(0x04034b50); head.writeUInt16LE(20, 4); head.writeUInt32LE(crc32(data), 14); head.writeUInt32LE(data.length, 18); head.writeUInt32LE(data.length, 22); head.writeUInt16LE(name.length, 26);
    local.push(head, name, data);
    const record = Buffer.alloc(46); record.writeUInt32LE(0x02014b50); record.writeUInt16LE(20, 6); record.writeUInt32LE(crc32(data), 16); record.writeUInt32LE(data.length, 20); record.writeUInt32LE(data.length, 24); record.writeUInt16LE(name.length, 28); record.writeUInt32LE(((entry.mode ?? 0x81a4) * 65536) >>> 0, 38); record.writeUInt32LE(offset, 42); directory.push(record, name); offset += head.length + name.length + data.length;
  }
  const central = Buffer.concat(directory), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, central, end]);
}
describe("archive and metadata logic", () => {
  it("reads ZIP roots and rejects traversal, case duplicates, links, overlap and corruption", () => {
    expect(archiveEntries(zip([{ name: "folder/package.json", data: "{}" }, { name: "folder/list.js", data: "module.exports={}" }])).map((x) => x.name)).toEqual(["folder/package.json", "folder/list.js"]);
    for (const name of ["../outside", "/outside", "C:/outside", "folder/../outside", "folder\\outside", "a\0b"]) expect(() => archiveEntries(zip([{ name }]))).toThrow("Unsafe");
    expect(() => archiveEntries(zip([{ name: "A.js" }, { name: "a.js" }]))).toThrow("Duplicate");
    expect(() => archiveEntries(zip([{ name: "link", mode: 0xa1ff }]))).toThrow("symlink");
    expect(() => archiveEntries(zip([{ name: "file" }, { name: "file/child" }]))).toThrow("overlaps");
    const corrupt = zip([{ name: "file", data: "okay" }]); corrupt[34] ^= 1; expect(() => archiveEntries(corrupt)).toThrow();
  });
  it("parses interval milliseconds and validates entrypoint names", () => {
    expect(parseInterval("5m")).toBe(300000); expect(parseInterval("10s")).toBe(10000); expect(parseInterval("9s")).toBeUndefined();
    expect(parseInterval("forever")).toBeUndefined(); expect(() => validateManifest({ name: "../escape", commands: [] })).toThrow();
  });
  it("runs interval jobs without overlaps, pauses in sleep, and resets due times after wake", async () => {
    const h = setup(); const scheduler = new ExtensionScheduler(h.ctx); let finish!: () => void; const run = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    scheduler.reconcile([{ id: "job", interval: "10s", run }]); scheduler.tick(Date.now() + 10001); scheduler.tick(Date.now() + 30000); expect(run).toHaveBeenCalledOnce(); finish(); await new Promise((resolve) => setImmediate(resolve));
    h.nativeEvents.emit("system.willSleep", {}); scheduler.tick(Date.now() + 100000); expect(run).toHaveBeenCalledOnce();
    h.nativeEvents.emit("system.didWake", {}); scheduler.tick(Date.now()); expect(run).toHaveBeenCalledOnce(); scheduler.stop();
  });
  it("maps extension AI selectors only to configured models", async () => {
    const h = setup(); h.ctx.ai.listModels = async () => [{ ref: "own/gpt-4o-mini", providerId: "own", providerName: "Own endpoint", modelId: "gpt-4o-mini", name: "Model", capabilities: {} as any }];
    expect(await resolveModel(h.ctx, "openai-gpt-4o-mini")).toBe("own/gpt-4o-mini"); await expect(resolveModel(h.ctx, "absent")).rejects.toThrow("not configured");
  });
});
