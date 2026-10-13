import { Worker } from "node:worker_threads";
import { randomUUID } from "node:crypto";
import { access, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { ExtensionSessionState, InstalledExtension, BackendEvents, MenuBarExtraItem, UINode } from "@opencast/protocol";
import type { AppContext, LaunchRequest } from "../../context";
import { safeName, within } from "./manifest";
export interface HostSession {
  id: string; extension: InstalledExtension; commandName: string; launch: LaunchRequest; state: ExtensionSessionState; worker: Worker;
  closeWindow: boolean; finished: boolean; toastCallbacks: Map<string, { primary?: string; secondary?: string }>;
  streams: Map<string, AbortController>; pending: Map<number, { resolve(value: any): void; reject(error: Error): void; timer: NodeJS.Timeout }>;
  request(method: string, params?: unknown, timeout?: number): Promise<any>;
}
export type RuntimeHandler = (session: HostSession, method: string, params: any) => Promise<any>;
export class ExtensionSessions {
  readonly sessions = new Map<string, HostSession>();
  readonly menuSessions = new Map<string, string>();
  private nextRequest = 0;
  private readonly retained = new Map<string, NodeJS.Timeout>();
  constructor(private readonly ctx: AppContext, private readonly handler: RuntimeHandler) {}
  get(id: string): HostSession { const session = this.sessions.get(id); if (!session) throw new Error("Extension session has closed"); return session; }
  async start(extension: InstalledExtension, commandName: string, preferences: Record<string, unknown>, launch: LaunchRequest, options: { tool?: boolean; input?: unknown; namedExport?: string; signal?: AbortSignal; draftValues?: Record<string, unknown> } = {}): Promise<{ session: HostSession; completion: Promise<any> }> {
    safeName(commandName);
    if (!extension.path) throw new Error("Extension files are not installed on this device. Reinstall the extension locally.");
    const command = extension.commands.find((x) => x.name === commandName);
    const mode = options.tool ? "no-view" : command?.mode;
    if (!mode) throw new Error("Extension command does not exist");
    const menuId = `ext:${extension.name}.${commandName}`;
    if (mode === "menu-bar") { const existing = this.menuSessions.get(menuId); if (existing) await this.close(existing, "completed", undefined, false); }
    const entryPath = within(extension.path, options.tool ? `tools/${commandName}.js` : `${commandName}.js`);
    await access(entryPath).catch(() => { throw new Error(`Missing entry point file: ${commandName}`); });
    const supportPath = join(this.ctx.dataDir, "extension-support", safeName(extension.name)); await mkdir(supportPath, { recursive: true });
    const resources = this.ctx.resourcesDir;
    const candidates = [(process.env.OPENCAST_EXTENSION_WORKER ?? process.env.SURGECAST_EXTENSION_WORKER), join(resources, "raycast-api/worker.cjs"), join(resources, "packages/raycast-api/dist/worker.cjs"), resolve(resources, "../raycast-api/dist/worker.cjs"), resolve(resources, "../packages/raycast-api/dist/worker.cjs")].filter((x): x is string => Boolean(x));
    const runtime = candidates.find((x) => existsSync(x));
    if (!runtime) throw new Error("Extension runtime is missing. Build @opencast/raycast-api or set OPENCAST_EXTENSION_WORKER.");
    const id = randomUUID();
    const worker = new Worker(runtime, {
      resourceLimits: { maxOldGenerationSizeMb: 512 }, stdout: true, stderr: true,
      env: Object.fromEntries(Object.entries({ PATH: process.env.PATH ?? "", HOME: process.env.HOME, TMPDIR: process.env.TMPDIR, TEMP: process.env.TEMP, LANG: process.env.LANG, LC_ALL: process.env.LC_ALL, TZ: process.env.TZ, NODE_ENV: extension.source === "development" && !this.ctx.settings.get("developer.useNodeProductionEnvironment") ? "development" : "production" }).filter((entry): entry is [string, string] => entry[1] !== undefined)),
      workerData: {
        sessionId: id, extensionName: extension.name, commandName, ownerOrAuthorName: extension.owner ?? extension.author,
        entryPointType: options.tool ? "tool" : "command", mode, entryPath, assetsPath: join(extension.path, "assets"), supportPath,
        preferences, isDevelopment: extension.source === "development", appearance: await this.ctx.native.call("system.appearance", undefined).catch(() => "dark"),
        aiAvailable: Boolean(await this.ctx.ai.defaultModel("extension").catch(() => null)), namedExport: options.namedExport, input: options.input,
        launchProps: { arguments: Object.fromEntries((command?.arguments ?? []).map((x) => [x.name, launch.arguments?.[x.name] ?? ""])), fallbackText: launch.fallbackText, launchContext: launch.launchContext, launchType: launch.source === "background" ? "background" : "userInitiated", draftValues: options.draftValues },
      },
    });
    // Extension logs can contain user credentials. Drain streams, never forward
    // arbitrary stdout/stderr into backend logs or the native RPC channel.
    worker.stdout?.resume(); worker.stderr?.resume();
    const session: HostSession = {
      id, extension, commandName, launch, worker, closeWindow: false, finished: false, toastCallbacks: new Map(), streams: new Map(), pending: new Map(),
      state: { sessionId: id, extensionName: extension.name, commandName, mode, root: null, depth: 1, isLoading: true },
      request: (method, params = {}, timeout = 30000) => new Promise((resolve, reject) => {
        if (session.finished) { reject(new Error("Extension session has closed")); return; }
        const requestId = ++this.nextRequest;
        const timer = setTimeout(() => { session.pending.delete(requestId); reject(new Error(`Extension worker timed out: ${method}`)); }, timeout);
        session.pending.set(requestId, { resolve, reject, timer }); worker.postMessage({ kind: "request", id: requestId, method, params });
      }),
    };
    this.sessions.set(id, session);
    if (mode === "menu-bar") this.menuSessions.set(menuId, id);
    worker.on("message", (message) => void this.message(session, message));
    worker.on("error", () => void this.failure(session, "The extension worker failed"));
    worker.on("exit", (code) => { if (!session.finished) void this.close(id, code === 0 ? "completed" : "error", code ? "Extension worker exited unexpectedly" : undefined, false); });
    const abort = () => { void this.close(id, "user"); };
    if (options.signal?.aborted) abort(); else options.signal?.addEventListener("abort", abort, { once: true });
    const completion = session.request("initialize", undefined, options.tool ? 120000 : 300000);
    completion.finally(() => options.signal?.removeEventListener("abort", abort)).catch(() => {});
    return { session, completion };
  }
  async close(id: string, reason: BackendEvents["ext.session.closed"]["reason"] = "user", error?: string, removeMenu = true): Promise<void> {
    const session = this.sessions.get(id); if (!session || session.finished) return;
    session.finished = true; this.sessions.delete(id);
    clearTimeout(this.retained.get(id)); this.retained.delete(id);
    for (const pending of session.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error("Extension session has closed")); } session.pending.clear();
    for (const stream of session.streams.values()) stream.abort();
    const menuId = `ext:${session.extension.name}.${session.commandName}`;
    if (this.menuSessions.get(menuId) === id) {
      this.menuSessions.delete(menuId);
      if (removeMenu) { this.ctx.entities.delete("localState", `ext:menu:${menuId}`); await this.ctx.native.call("menubar.remove", { id: menuId }).catch(() => {}); }
    }
    session.worker.postMessage({ kind: "request", id: ++this.nextRequest, method: "terminate", params: {} });
    await Promise.race([new Promise<void>((resolve) => session.worker.once("exit", () => resolve())), new Promise<void>((resolve) => setTimeout(resolve, 500))]);
    await session.worker.terminate();
    this.ctx.events.emit("ext.session.closed", { sessionId: id, reason, error });
  }
  async complete(session: HostSession): Promise<void> {
    if ([...session.toastCallbacks.values()].some((x) => x.primary || x.secondary)) {
      const timer = setTimeout(() => void this.close(session.id, "completed"), 600000); timer.unref(); this.retained.set(session.id, timer);
    } else await this.close(session.id, "completed");
  }
  async dispatch(id: string, handlerId: string, args: unknown[] = []): Promise<any> { return this.get(id).request("dispatch", { handlerId, args }); }
  async pop(id: string): Promise<{ closed: boolean }> { const result = await this.get(id).request("pop"); if (result.closed) await this.close(id, "user"); return result; }
  async closeExtension(name: string): Promise<void> { await Promise.all([...this.sessions.values()].filter((x) => x.extension.name === name).map((x) => this.close(x.id))); }
  async shutdown(): Promise<void> { await Promise.all([...this.sessions.keys()].map((id) => this.close(id, "completed", undefined, false))); }
  private async message(session: HostSession, message: any): Promise<void> {
    if (session.finished) return;
    if (message.kind === "result") {
      const entry = session.pending.get(message.id); if (!entry) return;
      session.pending.delete(message.id); clearTimeout(entry.timer);
      if (message.error) entry.reject(new Error(message.error.message)); else entry.resolve(message.value);
      return;
    }
    if (message.kind === "notify" && message.method === "render") {
      session.state = { ...session.state, ...message.params };
      this.ctx.events.emit("ext.session.updated", session.state);
      if (session.state.mode === "menu-bar" && session.state.root) {
        const menuId = `ext:${session.extension.name}.${session.commandName}`;
        this.ctx.entities.put("localState", `ext:menu:${menuId}`, { root: session.state.root });
        const root = session.state.root;
        await this.ctx.native.call("menubar.set", { id: menuId, title: root.props.title as string, icon: root.props.icon as any, tooltip: root.props.tooltip as string, items: menuItems(root.children) }).catch(() => { if (this.ctx.native.available) this.ctx.log.warn("Could not update extension menu bar item"); });
      }
      return;
    }
    if (message.kind === "request" || message.kind === "notify") {
      try {
        const value = await this.handler(session, message.method, message.params ?? {});
        if (message.kind === "request" && !session.finished) session.worker.postMessage({ kind: "result", id: message.id, value });
      } catch (error) {
        if (message.kind === "request" && !session.finished) session.worker.postMessage({ kind: "result", id: message.id, error: { message: error instanceof Error ? error.message : "Extension host call failed" } });
      }
    }
  }
  private async failure(session: HostSession, message: string): Promise<void> {
    this.ctx.events.emit("ext.toast", { sessionId: session.id, toast: { id: randomUUID(), style: "failure", title: "Extension failed", message } });
    await this.close(session.id, "error", message);
  }
}
export function menuItems(nodes: UINode[]): MenuBarExtraItem[] {
  return nodes.map((node) => ({ id: typeof (node.props.onAction as any)?.$handler === "string" ? (node.props.onAction as any).$handler : node.id, kind: node.type.endsWith(".Separator") ? "separator" : node.type.endsWith(".Section") ? "section" : node.type.endsWith(".Submenu") ? "submenu" : "item", title: node.props.title as string, subtitle: node.props.subtitle as string, icon: node.props.icon as any, tooltip: node.props.tooltip as string, shortcut: node.props.shortcut as any, enabled: typeof (node.props.onAction as any)?.$handler === "string" || node.children.length > 0, children: node.children.length ? menuItems(node.children) : undefined, alternate: (node.props.alternate as UINode | undefined)?.type ? menuItems([node.props.alternate as UINode])[0] : undefined }));
}
