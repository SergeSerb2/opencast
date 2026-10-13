import { parentPort, workerData } from "node:worker_threads";
import Module, { createRequire } from "node:module";
import { join } from "node:path";
import React from "react";
import { configure, dispatch, revive, reportError } from "./bridge";
import type { Initialization } from "./bridge";
import { ExtensionRenderer } from "./renderer";
if (!parentPort) throw new Error("The OpenCast extension runtime must run in a worker thread");
const port = parentPort;
let options: Initialization = workerData;
let renderer: ExtensionRenderer | undefined;
let requestId = 0;
const pending = new Map<number, { resolve(value: any): void; reject(error: Error): void }>();
function configureRuntime(input: Initialization) {
  options = input;
  for (const [key, value] of Object.entries({ EXTENSION_NAME: input.extensionName, COMMAND_NAME: input.commandName, ASSETS_PATH: input.assetsPath, SUPPORT_PATH: input.supportPath, RAYCAST_SESSION: input.sessionId, RAYCAST_VERSION: "2.7.3", RAYCASTX: "1", RAYCAST_SCHEME: "opencast" })) process.env[key] = value;
  configure(input, (method, params) => new Promise((resolve, reject) => {
    const id = ++requestId; pending.set(id, { resolve, reject }); port.postMessage({ kind: "request", id, method, params });
  }), (method, params) => port.postMessage({ kind: "notify", method, params }));
}
configureRuntime(options);
// Only these imports are intercepted. Dependencies and native addons retain the
// extension folder's ordinary Node resolution, including bundled node_modules.
const shared = createRequire(join(__dirname, "runtime.cjs"));
const aliases: Record<string, string> = {
  "@raycast/api": join(__dirname, "runtime.cjs"), react: shared.resolve("react"),
  "react/jsx-runtime": shared.resolve("react/jsx-runtime"), "react/jsx-dev-runtime": shared.resolve("react/jsx-dev-runtime"),
};
const loader = Module as any;
const originalResolve = loader._resolveFilename;
loader._resolveFilename = function(name: string, ...args: any[]) { return aliases[name] ?? originalResolve.call(this, name, ...args); };
process.on("unhandledRejection", (error) => fail(error));
process.on("uncaughtException", (error) => fail(error));
function fail(error: unknown) {
  reportError(error);
  renderer?.dispose();
  port.postMessage({ kind: "notify", method: "render", params: { depth: 1, isLoading: false, root: { type: "Detail", id: "extension-error", props: { markdown: `# Extension failed\n\n${error instanceof Error ? error.message : String(error)}` }, children: [] } } });
}
async function executeResult(value: any): Promise<any> {
  if (typeof value === "function") return executeResult(await value());
  if (Array.isArray(value)) return Promise.all(value.map(executeResult));
  if (value && typeof value === "object" && !(value instanceof Date) && !Buffer.isBuffer(value)) return Object.fromEntries(await Promise.all(Object.entries(value).map(async ([key, value]) => [key, await executeResult(value)])));
  return value;
}
async function initialize(input?: Initialization): Promise<any> {
  if (input?.entryPath) configureRuntime(input);
  const requireExtension = createRequire(options.entryPath);
  const loaded = requireExtension(options.entryPath);
  const entry = options.namedExport ? loaded[options.namedExport] : loaded.default ?? (typeof loaded === "function" ? loaded : undefined);
  if (options.entryPointType === "tool") {
    if (typeof entry !== "function") throw new Error("Extension tool has no callable export");
    return executeResult(await entry(revive(options.input)));
  }
  if (options.mode === "no-view") {
    const result = await (typeof entry === "function" ? entry(revive(options.launchProps)) : entry);
    await new Promise((resolve) => setImmediate(resolve));
    return result;
  }
  if (!entry || (typeof entry === "function" && entry.constructor.name === "AsyncFunction")) throw new Error("View commands require a synchronous React component");
  renderer = new ExtensionRenderer();
  renderer.render(React.createElement(entry, revive(options.launchProps)));
}
port.on("message", async (message: any) => {
  if (message.kind === "result") {
    const request = pending.get(message.id); if (!request) return; pending.delete(message.id);
    if (message.error) request.reject(new Error(message.error.message)); else request.resolve(message.value);
    return;
  }
  if (message.kind !== "request") return;
  try {
    let value: any;
    switch (message.method) {
      case "initialize": value = await initialize(message.params); break;
      case "dispatch": value = await dispatch(message.params.handlerId, message.params.args); break;
      case "pop": value = { closed: renderer?.pop() ?? true }; break;
      case "terminate": renderer?.dispose(); for (const entry of pending.values()) entry.reject(new Error("Extension session closed")); pending.clear(); port.close(); return;
      default: throw new Error(`Unknown worker request: ${message.method}`);
    }
    port.postMessage({ kind: "result", id: message.id, value });
  } catch (error) {
    if (message.method === "dispatch") fail(error);
    port.postMessage({ kind: "result", id: message.id, error: { message: error instanceof Error ? error.message : String(error) } });
  }
});
