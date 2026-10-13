// Opt-in live integration: run against a disposable --no-native backend.
// node packages/backend/test/extensions/verify-store.mjs ws://127.0.0.1:18943/rpc?token=t
import WebSocket from "ws";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const socket = new WebSocket(process.argv[2] ?? "ws://127.0.0.1:18943/rpc?token=t");
let nextId = 0;
const requests = new Map();
const states = new Map();
const toasts = [];
socket.on("message", (data) => {
  const message = JSON.parse(data.toString());
  if (message.id) { const pending = requests.get(message.id); if (pending) { requests.delete(message.id); clearTimeout(pending.timer); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result); } }
  else if (message.method === "event") {
    if (message.params.topic === "ext.session.updated") states.set(message.params.payload.sessionId, message.params.payload);
    if (message.params.topic === "ext.toast") toasts.push(message.params.payload);
  }
});
await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
function call(method, params = {}) {
  return new Promise((resolve, reject) => { const id = ++nextId; const timer = setTimeout(() => { requests.delete(id); reject(new Error(`Timed out: ${method}`)); }, 60000); requests.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ jsonrpc: "2.0", id, method, params })); });
}
async function tree(sessionId, predicate = (state) => Boolean(state.root), timeout = 20000) {
  const until = Date.now() + timeout;
  while (Date.now() < until) {
    const state = states.get(sessionId) ?? await call("ext.session.state", { sessionId });
    if (state && predicate(state)) return state;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("No sensible extension tree arrived");
}
function nodes(node) { return [node, ...node.children.flatMap(nodes), ...Object.values(node.props).filter((x) => x?.type && x?.children).flatMap(nodes)]; }
const results = [];
async function exercise(name, command, expected, options = {}) {
  const launch = await call("ext.session.start", { name, command, ...options });
  if (launch.kind === "view") return { name, command, setupRequired: launch.view.props.missingRequired };
  assert.equal(launch.kind, expected === "done" ? "done" : "extension");
  if (expected === "done") return { name, command, kind: "done", closeWindow: launch.closeWindow };
  const state = await tree(launch.sessionId, (s) => s.root && !s.root.props.isLoading);
  assert.equal(state.root.type, expected);
  assert(!String(state.root.props.markdown).includes("Extension failed"));
  const all = nodes(state.root);
  const result = { name, command, root: state.root.type, nodes: all.length, items: all.filter((x) => /(?:List|Grid)\.Item$/.test(x.type)).length, text: String(state.root.props.markdown ?? "").slice(0, 80) };
  // Search is safe; the resulting tree must remain valid.
  const search = state.root.props.onSearchTextChange;
  if (search?.$handler) { await call("ext.session.dispatch", { sessionId: launch.sessionId, handlerId: search.$handler, args: ["test"] }); result.searchDispatched = true; }
  // Exercise only read-only navigation actions in downloaded bundles.
  const push = all.find((x) => x.type === "Action.Push" || (name === "markdown-reference" && x.type === "Action" && x.props.title === "View"));
  if (push?.props.onAction?.$handler) {
    await call("ext.session.dispatch", { sessionId: launch.sessionId, handlerId: push.props.onAction.$handler, args: [{}] });
    const pushed = await tree(launch.sessionId, (s) => s.depth === 2); result.pushedRoot = pushed.root?.type;
    assert.deepEqual(await call("ext.session.pop", { sessionId: launch.sessionId }), { closed: false });
    await tree(launch.sessionId, (s) => s.depth === 1);
  }
  if (expected === "Form") {
    const field = all.find((x) => x.type === "Form.TextField" && x.props.onChange?.$handler);
    if (field) { await call("ext.session.dispatch", { sessionId: launch.sessionId, handlerId: field.props.onChange.$handler, args: ["Headless value"] }); result.formChangeDispatched = true; }
  }
  assert.deepEqual(await call("ext.session.pop", { sessionId: launch.sessionId }), { closed: true });
  assert.equal(await call("ext.session.state", { sessionId: launch.sessionId }), null);
  return result;
}
try {
  await call("extensions.install", { source: "local", path: "/tmp/opencast-re/pretty/api-template/dist" });
  for (const [command, expected] of [["static-list", "List"], ["detail", "Detail"], ["form", "Form"], ["grid", "Grid"], ["list-and-detail", "List"], ["menu-bar-extra", "MenuBarExtra"], ["blank", "done"], ["script", "done"], ["typeahead-search", "List"], ["ai", "Detail"]]) {
    try { results.push(await exercise("extension-template", command, expected)); } catch (error) { results.push({ name: "extension-template", command, error: error.message }); }
  }
  const candidates = [
    ["codedbyjordan/markdown-reference", "markdown-reference", "List"],
    ["joshuaiz/password-generator", "generate-random-password", "Form"],
    ["thomas/hacker-news", "frontpage", "List"],
    ["braydoncoyer/office-quotes", "index", "List"],
    ["koinzhang/menubar-calendar", "index", "MenuBarExtra"],
  ];
  for (const [slug, command, expected] of candidates) {
    try {
      const installed = await call("extensions.install", { source: "store", idOrSlug: slug });
      console.log("installed", installed.name, installed.version);
      results.push({ slug, version: installed.version, ...await exercise(installed.name, command, expected) });
    } catch (error) { results.push({ slug, command, error: error.message }); }
  }
  const output = { checkedAt: new Date().toISOString(), backend: "--no-native", results, failureToasts: toasts.filter((x) => x.toast?.style === "failure").map((x) => ({ title: x.toast.title, message: x.toast.message })) };
  console.log(JSON.stringify(output, null, 2));
  if (results.some((x) => x.error || x.setupRequired)) process.exitCode = 1;
  if ((process.env.OPENCAST_EXTENSION_REPORT ?? process.env.SURGECAST_EXTENSION_REPORT)) writeFileSync((process.env.OPENCAST_EXTENSION_REPORT ?? process.env.SURGECAST_EXTENSION_REPORT), JSON.stringify(output, null, 2) + "\n");
} finally { socket.close(); }
