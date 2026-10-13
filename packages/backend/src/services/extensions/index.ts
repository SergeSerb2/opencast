import { watch, type FSWatcher } from "node:fs";
import { join } from "node:path";
import Ajv from "ajv";
import type { AIToolInfo, CommandInfo, CommandPrefs, InstalledExtension, LaunchResult } from "@surgecast/protocol";
import type { AppContext, LaunchRequest, Service } from "../../context";
import { ExtensionInstaller } from "./install";
import { ExtensionPreferences, definitions } from "./preferences";
import { ExtensionSessions, menuItems } from "./sessions";
import { ExtensionBroker } from "./broker";
import { readManifest, within, type Manifest } from "./manifest";
import { ExtensionScheduler } from "./scheduler";

export const extensionsService: Service = { name: "extensions", register(ctx) { new ExtensionsHost(ctx).register(); } };
export class ExtensionsHost {
  readonly installer: ExtensionInstaller;
  readonly preferences: ExtensionPreferences;
  readonly sessions: ExtensionSessions;
  readonly broker: ExtensionBroker;
  private readonly watchers = new Map<string, { watcher: FSWatcher; timer?: NodeJS.Timeout }>();
  private readonly reloads = new Map<string, Promise<void>>();
  private scheduler?: ExtensionScheduler;
  private readonly menuLoads = new Map<string, Promise<string | undefined>>();
  private readonly ajv = new Ajv({ strict: false, allErrors: true });
  constructor(private readonly ctx: AppContext) {
    this.installer = new ExtensionInstaller(ctx); this.preferences = new ExtensionPreferences(ctx); this.broker = new ExtensionBroker(ctx);
    this.sessions = new ExtensionSessions(ctx, (session, method, params) => this.broker.request(session, method, params)); this.broker.sessions = this.sessions;
  }
  register(): void {
    const ctx = this.ctx;
    ctx.db.addMigrations({ id: "extensions-001-storage", up: "CREATE TABLE extension_storage (extension TEXT NOT NULL,key TEXT NOT NULL,value TEXT NOT NULL,PRIMARY KEY(extension,key))" });
    ctx.commands.registerProvider({ id: "extensions", list: () => this.commands(), launch: (command, request) => this.launch(command, request) });
    ctx.tools.registerProvider({ id: "ext", list: () => this.tools(), call: (name, args, options) => this.callTool(name, args, options.signal) });
    ctx.rpc.handleAll({
      "extensions.list": () => this.installer.list(),
      "extensions.store.search": async (params) => { const result = await this.installer.store.search(params); return { ...result, items: result.items.map((item) => this.installedStatus(item)) }; },
      "extensions.store.get": async ({ idOrSlug }) => this.installedStatus(await this.installer.store.get(idOrSlug)),
      "extensions.install": async (params) => { const extension = await this.installer.install(params); await this.sessions.closeExtension(extension.name); this.refreshScheduler(); return extension; },
      "extensions.uninstall": async ({ name }) => { this.stopWatch(name); await this.reloads.get(name)?.catch(() => {}); await this.sessions.closeExtension(name); await this.installer.uninstall(name); this.refreshScheduler(); },
      "extensions.setEnabled": async ({ name, enabled }) => {
        this.installer.get(name); ctx.entities.patch<InstalledExtension>("extensions", name, { enabled });
        if (!enabled) await this.sessions.closeExtension(name); this.installer.changed(); this.refreshScheduler();
      },
      "extensions.getPreferences": ({ name, command }) => this.preferences.get(this.installer.get(name), command),
      "extensions.setPreferences": async ({ name, command, values }) => { await this.preferences.set(this.installer.get(name), command, values); this.installer.changed(); },
      "extensions.develop": async ({ path }) => { const extension = await this.installer.install({ source: "development", path }); this.startWatch(extension.name, path); this.refreshScheduler(); return extension; },
      "extensions.update": async ({ name }) => {
        const updated: string[] = [];
        const extensions = name ? [this.installer.get(name)] : this.installer.list();
        for (const extension of extensions.filter((x) => x.source === "store")) {
          const slug = `${extension.owner ?? extension.author}/${extension.name}`;
          const latest = await this.installer.store.raw(slug);
          if ((latest.commit_sha ?? latest.version) === extension.version) continue;
          await this.installer.install({ source: "store", idOrSlug: slug }); await this.sessions.closeExtension(extension.name); updated.push(extension.name);
        }
        this.refreshScheduler(); return { updated };
      },
      "ext.session.start": async ({ name, command, draftValues, launchType, ...props }) => {
        const info = (await this.commands()).find((x) => x.id === `ext:${name}.${command}`);
        if (!info) throw new Error("Extension command is not installed");
        const prefs = ctx.entities.get<CommandPrefs>("commandPrefs", info.id)?.data;
        if (prefs?.enabled === false || (!info.enabled && prefs?.enabled !== true)) throw new Error("Extension command is disabled");
        return this.launch(info, { ...props, source: launchType === "background" ? "background" : "extension" }, draftValues);
      },
      "ext.session.state": ({ sessionId }) => this.sessions.sessions.get(sessionId)?.state ?? null,
      "ext.session.dispatch": ({ sessionId, handlerId, args }) => this.sessions.dispatch(sessionId, handlerId, args),
      "ext.session.pop": ({ sessionId }) => this.sessions.pop(sessionId),
      "ext.session.close": ({ sessionId }) => this.sessions.close(sessionId),
      "ext.alert.respond": ({ alertId, confirmed }) => this.broker.respond(alertId, confirmed),
      "ext.toast.action": async ({ sessionId, toastId, action }) => {
        const handlerId = this.sessions.get(sessionId).toastCallbacks.get(toastId)?.[action];
        if (!handlerId) throw new Error("Toast action is no longer available");
        await this.sessions.dispatch(sessionId, handlerId);
      },
    });
    ctx.native.on("menubar.itemClicked", ({ menuId, itemId }) => {
      void this.menuSession(menuId).then((sessionId) => sessionId && this.sessions.dispatch(sessionId, itemId, [{ type: "left-click" }])).catch(() => this.failureToast("Could not run menu bar action"));
    });
    ctx.native.on("menubar.opened", ({ menuId }) => { void this.menuSession(menuId).catch(() => this.failureToast("Could not refresh menu bar command")); });
    ctx.entities.onChange((change) => {
      if (change.collection === "commandPrefs" || change.collection === "extensions") this.refreshScheduler();
      if (change.collection === "extensions" && change.source === "sync") {
        if (!ctx.entities.get<InstalledExtension>("extensions", change.id)?.data.enabled) void this.sessions.closeExtension(change.id);
        ctx.commands.invalidate("extensions"); ctx.events.emit("extensions.changed", {}); }
    });
    ctx.onReady(async () => {
      this.scheduler = new ExtensionScheduler(ctx); this.refreshScheduler();
      for (const extension of this.installer.list()) {
        const source = ctx.entities.get<{ sourcePath?: string }>("localState", `ext:${extension.name}:install`)?.data.sourcePath;
        if (extension.source === "development" && source) this.startWatch(extension.name, source);
        if (!extension.enabled || !extension.path) continue;
        for (const command of extension.commands.filter((x) => x.mode === "menu-bar")) {
          const menuId = `ext:${extension.name}.${command.name}`;
          const saved = ctx.entities.get<{ root: any }>("localState", `ext:menu:${menuId}`)?.data;
          if (saved) {
            await ctx.native.call("menubar.set", { id: menuId, title: saved.root.props.title, icon: saved.root.props.icon, tooltip: saved.root.props.tooltip, items: menuItems(saved.root.children) }).catch(() => {});
            await this.menuSession(menuId).catch(() => this.failureToast("Could not restore menu bar command"));
          }
        }
      }
    });
    ctx.onShutdown(async () => { this.scheduler?.stop(); for (const name of this.watchers.keys()) this.stopWatch(name); await Promise.allSettled([...this.reloads.values()]); await this.sessions.shutdown(); });
  }
  async commands(): Promise<CommandInfo[]> {
    const commands: CommandInfo[] = [];
    for (const extension of this.installer.list()) {
      for (const command of extension.commands) {
        const id = `ext:${extension.name}.${command.name}`;
        const metadata = this.ctx.entities.get<{ subtitle?: string | null }>("localState", `${id}:metadata`)?.data;
        commands.push({ id, kind: "extension", title: command.title, subtitle: metadata?.subtitle ?? extension.title, typeLabel: "Command", icon: extension.path && (command.icon || extension.icon) ? within(join(extension.path, "assets"), command.icon ?? extension.icon!) : "puzzle-piece-16", mode: command.mode, arguments: command.arguments, keywords: command.keywords, enabled: extension.enabled && !command.disabledByDefault && Boolean(extension.path), extensionId: extension.name, extensionTitle: extension.title, description: command.description, interval: command.interval, needsPreferences: (await this.preferences.get(extension, command.name)).missingRequired.length > 0 });
      }
    }
    return commands;
  }
  async launch(command: CommandInfo, request: LaunchRequest, draftValues?: Record<string, unknown>): Promise<LaunchResult> {
    const extension = this.installer.get(command.extensionId!);
    if (!extension.enabled) throw new Error("This extension is disabled");
    const manifest = extension.commands.find((x) => command.id === `ext:${extension.name}.${x.name}`);
    if (!manifest) throw new Error("Extension command not found");
    const prefs = await this.preferences.get(extension, manifest.name);
    if (prefs.missingRequired.length) return { kind: "view", view: { id: "extension.preferences", props: { name: extension.name, command: manifest.name, preferences: definitions(extension, manifest.name), missingRequired: prefs.missingRequired } } };
    const { session, completion } = await this.sessions.start(extension, manifest.name, prefs.values, request, { draftValues });
    try {
      await completion;
      if (manifest.mode === "no-view") { const closeWindow = session.closeWindow; await this.sessions.complete(session); return { kind: "done", closeWindow }; }
      return { kind: "extension", sessionId: session.id, mode: manifest.mode };
    } catch (error) { await this.sessions.close(session.id, "error", "Extension could not start"); throw error; }
  }
  async tools(): Promise<AIToolInfo[]> {
    const result: AIToolInfo[] = [];
    for (const extension of this.installer.list().filter((x) => x.enabled && x.path)) {
      const manifest = await readManifest(extension.path!);
      for (const tool of extension.tools) {
        let schema = toolSchema(manifest, tool);
        if (schema.type !== "object") schema = { type: "object", properties: { input: schema }, required: ["input"] };
        result.push({ name: `ext:${extension.name}.${tool.name}`, title: tool.title, description: tool.description, toolset: `ext:${extension.name}`, toolsetTitle: extension.title, icon: tool.icon && within(join(extension.path!, "assets"), tool.icon), inputSchema: schema, requiresConfirmation: tool.confirmation });
      }
    }
    return result;
  }
  async callTool(name: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<unknown> {
    const info = (await this.tools()).find((x) => x.name === name); if (!info) throw new Error("Extension tool is not installed or enabled");
    const extension = this.installer.get(info.toolset.slice(4)); const tool = extension.tools.find((x) => `ext:${extension.name}.${x.name}` === name)!;
    const validate = this.ajv.compile(info.inputSchema); if (!validate(args)) throw new Error(`Invalid extension tool input: ${this.ajv.errorsText(validate.errors)}`);
    const prefs = await this.preferences.get(extension); if (prefs.missingRequired.length) throw new Error(`Configure required extension preferences: ${prefs.missingRequired.join(", ")}`);
    const schema = toolSchema(await readManifest(extension.path!), tool);
    const input = schema.type !== "object" ? args.input : args;
    if (tool.confirmation) {
      const { session, completion } = await this.sessions.start(extension, tool.name, prefs.values, { source: "extension" }, { tool: true, input, namedExport: "confirmation", signal });
      try {
        const confirmation = await completion;
        if (confirmation && !await this.broker.alert(session, { title: confirmation.title ?? tool.title, message: [confirmation.message, ...(confirmation.info ?? []).map((x: any) => `${x.name}: ${x.value ?? ""}`)].filter(Boolean).join("\n"), icon: confirmation.image, primaryAction: { title: "Run", style: confirmation.style === "destructive" ? "destructive" : "default" } })) throw new Error("Extension tool was cancelled");
      } finally { await this.sessions.close(session.id, "completed"); }
    }
    const { session, completion } = await this.sessions.start(extension, tool.name, prefs.values, { source: "extension" }, { tool: true, input, signal });
    try { return await completion; } finally { await this.sessions.close(session.id, "completed"); }
  }
  private installedStatus<T extends { name: string }>(item: T): T & { installed: boolean; installedVersion?: string } {
    const extension = this.installer.list().find((x) => x.name === item.name); return { ...item, installed: Boolean(extension?.path), installedVersion: extension?.version };
  }
  private menuSession(menuId: string): Promise<string | undefined> {
    const pending = this.menuLoads.get(menuId); if (pending) return pending;
    const task = this.loadMenuSession(menuId); this.menuLoads.set(menuId, task);
    task.finally(() => { if (this.menuLoads.get(menuId) === task) this.menuLoads.delete(menuId); }).catch(() => {});
    return task;
  }
  private async loadMenuSession(menuId: string): Promise<string | undefined> {
    const existing = this.sessions.menuSessions.get(menuId);
    if (existing) {
      for (let i = 0; i < 100; i++) { if (this.sessions.get(existing).state.root) return existing; await new Promise((resolve) => setTimeout(resolve, 20)); }
      throw new Error("Menu bar extension did not render");
    }
    const command = (await this.commands()).find((x) => x.id === menuId && x.mode === "menu-bar" && x.enabled);
    if (!command) return;
    const result = await this.launch(command, { source: "background" });
    if (result.kind !== "extension") return;
    // A persisted native callback must wait for the fresh React tree to register it.
    for (let i = 0; i < 100; i++) { if (this.sessions.get(result.sessionId).state.root) return result.sessionId; await new Promise((resolve) => setTimeout(resolve, 20)); }
    throw new Error("Menu bar extension did not render");
  }
  private refreshScheduler(): void {
    if (!this.scheduler) return;
    const jobs: { id: string; interval?: string; run(): Promise<void> }[] = [];
    for (const extension of this.installer.list().filter((x) => x.enabled && x.path)) for (const command of extension.commands) {
      const id = `ext:${extension.name}.${command.name}`; const prefs = this.ctx.entities.get<CommandPrefs>("commandPrefs", id)?.data;
      if (!prefs?.intervalEnabled || prefs.enabled === false || (command.disabledByDefault && prefs.enabled !== true) || !command.interval) continue;
      jobs.push({ id, interval: command.interval, run: async () => {
        const info = (await this.commands()).find((x) => x.id === id)!;
        const result = await this.launch(info, { source: "background" });
        if (result.kind === "extension" && result.mode === "view") await this.sessions.close(result.sessionId, "completed");
      } });
    }
    this.scheduler.reconcile(jobs);
  }
  private startWatch(name: string, path: string): void {
    this.stopWatch(name);
    const record: { watcher: FSWatcher; timer?: NodeJS.Timeout } = { watcher: watch(path, { recursive: true }, (_event, file) => {
      if (file && !/\.js$|\.json$|assets[\/]/.test(String(file))) return;
      clearTimeout(record.timer);
      record.timer = setTimeout(() => { void this.reload(name, path).catch(() => this.failureToast("Extension rebuild could not be loaded")); }, 250);
    }) };
    record.watcher.on("error", () => { this.stopWatch(name); this.failureToast("Extension development watcher stopped"); }); this.watchers.set(name, record);
  }
  private stopWatch(name: string): void { const record = this.watchers.get(name); if (record) { clearTimeout(record.timer); record.watcher.close(); this.watchers.delete(name); } }
  private reload(name: string, path: string): Promise<void> {
    const previous = this.reloads.get(name) ?? Promise.resolve();
    const record = this.watchers.get(name);
    const task = previous.catch(() => {}).then(async () => {
      if (!record || this.watchers.get(name) !== record) return;
      await this.reloadSource(name, path);
    });
    this.reloads.set(name, task);
    task.finally(() => { if (this.reloads.get(name) === task) this.reloads.delete(name); }).catch(() => {});
    return task;
  }
  private async reloadSource(name: string, path: string): Promise<void> {
    const active = [...this.sessions.sessions.values()].filter((x) => x.extension.name === name && x.state.mode !== "no-view").map((x) => ({ commandName: x.commandName, id: x.id, launch: x.launch }));
    await this.installer.install({ source: "development", path });
    if (!this.watchers.has(name)) return;
    for (const session of active) { await this.sessions.close(session.id, "completed", undefined, false); const command = (await this.commands()).find((x) => x.id === `ext:${name}.${session.commandName}`); if (command) { const result = await this.launch(command, session.launch); this.ctx.launcher.navigate({ action: "launch", result }); } }
    this.refreshScheduler();
  }
  private failureToast(title: string): void { this.ctx.launcher.toast({ id: "extensions-error", style: "failure", title }); }
}

function toolSchema(manifest: Manifest, tool: InstalledExtension["tools"][number]): Record<string, unknown> {
  if (tool.input) return tool.input;
  const configured = manifest.ai?.tools;
  const declared = Array.isArray(configured) ? configured.find((x) => x.name === tool.name)?.input : configured?.[tool.name];
  if (declared && typeof declared.input === "object" && declared.input) return declared.input as Record<string, unknown>;
  return declared ?? { type: "object", additionalProperties: true };
}
