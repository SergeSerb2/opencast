import { randomBytes, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import type { AlertOptions, ClipboardContent, AIModelOption, ToastState, ScreenInfo } from "@opencast/protocol";
import type { AppContext } from "../../context";
import type { HostSession, ExtensionSessions } from "./sessions";
interface OAuthFlow { sessionId: string; callbackId: string; expires: number; }
interface PendingAlert { sessionId: string; resolve(value: boolean): void; timer: NodeJS.Timeout; }
export class ExtensionBroker {
  private readonly flows = new Map<string, OAuthFlow>();
  private readonly alerts = new Map<string, PendingAlert>();
  sessions!: ExtensionSessions;
  constructor(private readonly ctx: AppContext) {
    ctx.native.on("url.opened", ({ url }) => void this.oauthRedirect(url));
    ctx.events.on("ext.session.closed", ({ sessionId }) => {
      for (const [state, flow] of this.flows) if (flow.sessionId === sessionId) this.flows.delete(state);
      for (const [id, alert] of this.alerts) if (alert.sessionId === sessionId) { clearTimeout(alert.timer); alert.resolve(false); this.alerts.delete(id); }
    });
  }
  respond(id: string, confirmed: boolean): void {
    const alert = this.alerts.get(id); if (!alert) throw new Error("Extension alert has expired");
    this.alerts.delete(id); clearTimeout(alert.timer); alert.resolve(confirmed);
  }
  alert(session: HostSession, options: AlertOptions): Promise<boolean> {
    if (session.state.mode === "menu-bar" || session.state.mode === "no-view") {
      return this.ctx.native.call("alert.show", { title: options.title, message: options.message, buttons: [options.primaryAction?.title ?? "Confirm", options.dismissAction?.title ?? "Cancel"], style: options.primaryAction?.style === "destructive" ? "warning" : "informational" }).then((result) => result.index === 0);
    }
    return new Promise((resolve) => {
      const id = randomUUID(); const timer = setTimeout(() => { this.alerts.delete(id); resolve(false); }, 300000); timer.unref();
      this.alerts.set(id, { sessionId: session.id, resolve, timer });
      this.ctx.events.emit("ext.alert", { sessionId: session.id, alertId: id, options });
    });
  }
  async request(session: HostSession, method: string, p: any): Promise<any> {
    const ctx = this.ctx; const extension = session.extension.name;
    const invoke = (method: string, params: unknown) => ctx.rpc.invoke(method, params, { connectionId: `ext:${session.id}`, signal: new AbortController().signal });
    switch (method) {
      case "commandException":
        ctx.events.emit("ext.toast", { sessionId: session.id, toast: { id: randomUUID(), style: "failure", title: "Extension failed", message: p.message } });
        if (session.state.mode === "no-view") await this.sessions.close(session.id, "error", "Extension failed");
        return;
      case "captureException": case "logCommand": case "reportMemoryUsage": return;
      case "showToast": case "updateToast": {
        const toast: ToastState = { id: p.id, title: p.title ?? "", style: ({ SUCCESS: "success", FAILURE: "failure", ANIMATED: "animated" } as const)[p.style as "SUCCESS" | "FAILURE" | "ANIMATED"] ?? p.style ?? "success", message: p.message, primaryAction: p.primaryAction, secondaryAction: p.secondaryAction };
        session.toastCallbacks.set(p.id, { primary: p.primaryAction?.handler?.$handler, secondary: p.secondaryAction?.handler?.$handler });
        ctx.events.emit("ext.toast", { sessionId: session.id, toast }); return;
      }
      case "hideToast": session.toastCallbacks.delete(p.id); ctx.events.emit("ext.toast", { sessionId: session.id, toast: null }); return;
      case "showAlert": return this.alert(session, p);
      case "showHUD": session.closeWindow = true; await ctx.launcher.hud(p.title); return;
      case "closeMainRaycastWindow": session.closeWindow = true; ctx.launcher.navigate({ action: "close", clearSearchBar: p.clearRootSearch }); await ctx.native.call("window.hide", { kind: "main", restoreFocus: true }).catch((error) => { if (ctx.native.available) throw error; }); return;
      case "popToRoot":
        if (session.extension.source === "development" && ctx.settings.get("developer.disablePopToRootSearch")) return;
        ctx.launcher.navigate({ action: "popToRoot", clearSearchBar: p.clearSearchBar }); return;
      case "clearSearchBar": ctx.events.emit("ext.ui.control", { sessionId: session.id, action: "clearSearchBar" }); return;
      case "getFormPassword": return ctx.secrets.get(`ext:${extension}:form:${session.commandName}:${p.itemId}`);
      case "setFormPassword": {
        await ctx.secrets.set(`ext:${extension}:form:${session.commandName}:${p.itemId}`, p.value);
        const key = `ext:${extension}:formPasswords`;
        const ids = ctx.entities.get<{ ids: string[] }>("localState", key)?.data.ids ?? [];
        ctx.entities.put("localState", key, { ids: [...new Set([...ids, `${session.commandName}:${p.itemId}`])] });
        return;
      }
      case "formSetFocus": case "formReset": ctx.events.emit("ext.ui.control", { sessionId: session.id, action: method === "formSetFocus" ? "focus" : "reset", itemId: p.itemId }); return;
      case "shakeMainRaycastWindow": ctx.events.emit("ext.ui.control", { sessionId: session.id, action: "shake" }); return;
      case "openExtensionPreferences": case "openCommandPreferences": ctx.launcher.navigate({ action: "launch", result: { kind: "view", view: { id: "extension.preferences", props: { name: extension, command: method === "openCommandPreferences" ? session.commandName : undefined } } } }); return;
      case "setClipboard": await ctx.native.call("clipboard.write", { content: clipboard(p.contents), concealed: p.concealed, transient: p.transient }); return;
      case "paste": session.closeWindow = true; await ctx.native.call("input.paste", { content: clipboard(p.contents) }); return;
      case "clearClipboard": await ctx.native.call("clipboard.clear", undefined); return;
      case "getClipboard": {
        if (!Number.isInteger(p.offset) || p.offset < 0) throw new Error("Clipboard offset must be a nonnegative integer");
        if (p.offset > 0) {
          const history = await invoke("clipboard.list", { limit: 1, offset: p.offset }) as any;
          const item = history.items[0]; return { text: item?.text ?? "", html: item?.html, file: item?.filePaths?.[0] };
        }
        const snapshot = await ctx.native.call("clipboard.read", undefined);
        return { text: snapshot?.text ?? (snapshot?.primary.kind === "text" ? snapshot.primary.text : ""), html: snapshot?.html, file: snapshot?.primary.kind === "file" ? snapshot.primary.paths[0] : undefined };
      }
      case "getSelectedText": { const text = await ctx.native.call("input.selectedText", undefined); if (text === null) throw new Error("No text is selected in the frontmost application"); return { text }; }
      case "getSelectedFinderItems": return { items: (await ctx.native.call("input.selectedFinderItems", undefined)).map((path) => ({ path })) };
      case "getApplications": return { value: p.path ? await ctx.native.call("apps.forUrl", { url: /^[a-z][a-z\d+.-]*:/i.test(p.path) ? p.path : pathToFileURL(p.path).href }) : await ctx.native.call("apps.list", {}) };
      case "getDefaultApplication": { const app = await ctx.native.call("apps.defaultForPath", { path: p.path }); if (!app) throw new Error("No default application for this path"); return { value: app }; }
      case "getFrontmostApplication": { const app = await ctx.native.call("apps.previous", undefined) ?? await ctx.native.call("apps.frontmost", undefined); if (!app) throw new Error("No frontmost application is available"); return { value: app }; }
      case "open": session.closeWindow = true; await ctx.native.call("window.hide", { kind: "main", restoreFocus: true }).catch(() => {}); if (/^[a-z][a-z\d+.-]*:/i.test(p.path)) await ctx.native.call("open.url", { url: p.path, app: p.app }); else await ctx.native.call("open.path", { path: p.path, app: p.app }); return;
      case "showInFinder": await ctx.native.call("open.showInFinder", { path: p.path }); return;
      case "trashItems": await ctx.native.call("open.trash", { paths: p.paths }); return { trashed: p.paths, notTrashed: [] };
      case "toggleQuickLook": await ctx.native.call("open.quickLook", { path: p.path }); return;
      case "allLocalStorageItems": return { values: Object.fromEntries(ctx.db.all<{ key: string; value: string }>("SELECT key,value FROM extension_storage WHERE extension=?", extension).map((row) => [row.key, JSON.parse(row.value)])) };
      case "getLocalStorageItem": { const row = ctx.db.get<{ value: string }>("SELECT value FROM extension_storage WHERE extension=? AND key=?", extension, String(p.key)); return { value: row ? JSON.parse(row.value) : null }; }
      case "setLocalStorageItem":
        if (!["string", "number", "boolean"].includes(typeof p.value) || (typeof p.value === "number" && !Number.isFinite(p.value))) throw new Error("Invalid LocalStorage value");
        ctx.db.run("INSERT INTO extension_storage(extension,key,value) VALUES (?,?,?) ON CONFLICT(extension,key) DO UPDATE SET value=excluded.value", extension, String(p.key), JSON.stringify(p.value)); return;
      case "removeLocalStorageItem": ctx.db.run("DELETE FROM extension_storage WHERE extension=? AND key=?", extension, String(p.key)); return;
      case "clearLocalStorage": ctx.db.run("DELETE FROM extension_storage WHERE extension=?", extension); return;
      case "updateCommandMetadata": {
        const key = `ext:${extension}.${session.commandName}:metadata`;
        ctx.entities.put("localState", key, { subtitle: p.subtitle }); ctx.commands.invalidate("extensions"); return;
      }
      case "launchCommand": {
        const name = p.extensionName ?? extension;
        const result = await ctx.commands.launch(`ext:${name}.${p.name}`, { source: p.type === "background" ? "background" : "extension", arguments: p.arguments, fallbackText: p.fallbackText, launchContext: p.context && typeof p.context === "string" ? JSON.parse(p.context) : p.context });
        if (p.type !== "background") ctx.launcher.navigate({ action: "launch", result }); return;
      }
      case "initOAuth": {
        for (const [state, flow] of this.flows) if (flow.expires < Date.now()) this.flows.delete(state);
        const state = randomBytes(32).toString("base64url"); this.flows.set(state, { sessionId: session.id, callbackId: p.onRedirect, expires: Date.now() + 600000 });
        return { state, redirectURI: "opencast://oauth" };
      }
      case "authorizeOAuth": {
        const url = new URL(p.url); if (url.protocol !== "https:" && url.hostname !== "localhost" && url.hostname !== "127.0.0.1") throw new Error("OAuth authorization URLs must use HTTPS");
        await ctx.native.call("open.url", { url: url.href }); return;
      }
      case "setOAuthTokens": {
        const providerId = p.providerId ?? "default";
        await ctx.secrets.set(`oauth:${extension}:${providerId}`, JSON.stringify(p.tokenSet));
        const ids = ctx.entities.get<{ ids: string[] }>("localState", `ext:${extension}:oauthProviders`)?.data.ids ?? [];
        ctx.entities.put("localState", `ext:${extension}:oauthProviders`, { ids: [...new Set([...ids, providerId])] });
        return;
      }
      case "getOAuthTokens": { const raw = await ctx.secrets.get(`oauth:${extension}:${p.providerId ?? "default"}`); return { tokenSet: raw ? JSON.parse(raw) : undefined }; }
      case "removeOAuthTokens": await ctx.secrets.delete(`oauth:${extension}:${p.providerId ?? "default"}`); return;
      case "completePrompt": return this.completePrompt(session, p);
      case "cancelAI": session.streams.get(p.streamId)?.abort(); return;
      case "refreshModels": await ctx.ai.listModels(); return;
      case "aiDecide": {
        const controller = new AbortController(); session.streams.set(p.streamId, controller);
        try {
        const result = await ctx.ai.complete({ purpose: "extension", signal: controller.signal, messages: [{ role: "user", content: `Return only a JSON object answering each question. For noul use {type:"noul",noul:0..1}; choice use {type:"choice",choice,confidence,probabilities}; score use {type:"score",score,confidence,legend,probabilities}. State and questions: ${JSON.stringify(p)}` }] });
        const parsed = JSON.parse(result.text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
        if (!parsed || typeof parsed !== "object" || Object.keys(p.questions).some((key) => !validDecision(parsed[key], p.questions[key]))) throw new Error("AI returned an invalid decision response");
        return parsed;
        } finally { session.streams.delete(p.streamId); }
      }
      case "browserExtensionExecuteJS": case "browserExtensionGetContent": case "browserExtensionGetTabs": throw new Error("BrowserExtension is not supported yet");
      case "getDesktops": {
        throw new Error("The native host cannot enumerate macOS Spaces yet; screens are not desktops");
      }
      case "getActiveWindow": {
        const window = await ctx.native.call("windows.focused", undefined); if (!window) throw new Error("No accessible active window");
        // windows.focused reports absolute, top-left AX points, not layout fractions.
        return { window: { id: "active", application: window.app, bounds: { position: { x: window.frame.x, y: window.frame.y }, size: { width: window.frame.width, height: window.frame.height } }, desktopId: "active", fullScreenSettable: true, resizable: true, positionable: true, active: true } };
      }
      case "getWindowsOnActiveDesktop": throw new Error("Listing all windows on the current desktop is not available from the native host yet");
      case "setWindowBounds": {
        if (p.id !== "active" || (p.desktopId && p.desktopId !== "active")) throw new Error("The native host can move only the active window on its current desktop");
        if (p.bounds === "fullscreen") { await ctx.native.call("windows.run", { command: "toggleFullscreen" }); return; }
        const window = await ctx.native.call("windows.focused", undefined); const screens = await ctx.native.call("windows.screens", undefined);
        if (!window || !screens.length) throw new Error("Window bounds are unavailable");
        const visible = visibleFrameForWindow(window.frame, screens);
        const frame = window.frame;
        const rect = { x: ((p.bounds.position?.x ?? frame.x) - visible.x) / visible.width, y: ((p.bounds.position?.y ?? frame.y) - visible.y) / visible.height, width: (p.bounds.size?.width ?? frame.width) / visible.width, height: (p.bounds.size?.height ?? frame.height) / visible.height };
        if (Object.values(rect).some((x) => !Number.isFinite(x))) throw new Error("Invalid window bounds");
        await ctx.native.call("windows.applyLayout", { rect, gap: 0 }); return;
      }
      case "createRaycastNote": return noteData(await invoke("notes.create", { content: p.content }));
      case "searchRaycastNotes": { const notes = await invoke("notes.list", { query: p.query }) as any[]; return { data: notes.slice(p.page * 50, (p.page + 1) * 50).map(noteData), hasMore: notes.length > (p.page + 1) * 50 }; }
      case "readRaycastNote": { const note = await invoke("notes.get", { id: p.noteId }) as any; if (!note) throw new Error("Note not found"); return { content: note.content }; }
      case "updateRaycastNote": { const note = await invoke("notes.update", { id: p.noteId, content: p.content }) as any; return { title: note.title, updatedAt: new Date(note.updatedAt).toISOString() }; }
      case "deleteRaycastNote": return invoke("notes.delete", { id: p.noteId });
      case "openRaycastNote": await ctx.native.call("window.show", { kind: "notes", payload: { id: p.noteId } }); return;
      case "createQuicklink": ctx.launcher.navigate({ action: "launch", result: { kind: "view", view: { id: "quicklinks.create", props: { url: p.link, name: p.name, application: p.application, icon: p.iconName } } } }); return;
      case "createSnippet": ctx.launcher.navigate({ action: "launch", result: { kind: "view", view: { id: "snippets.create", props: { text: p.snippet, name: p.name, keyword: p.keyword } } } }); return;
      case "installMCPServer": return invoke("ai.mcp.upsert", p);
      case "renderEmpty": case "renderSuspense": return;
      case "render": throw new Error("Legacy Raycast render envelopes are not accepted; OpenCast uses UINode trees");
      default: throw new Error(`Extension host API is not supported: ${method}`);
    }
  }
  private async completePrompt(session: HostSession, p: any): Promise<{ text: string }> {
    const controller = new AbortController(); session.streams.set(p.streamId, controller);
    let callbacks = Promise.resolve(); let streamed = false;
    try {
      const model = p.model ? await resolveModel(this.ctx, p.model) : undefined;
      const result = await this.ctx.ai.complete({ purpose: "extension", model, creativity: p.temperature, messages: [{ role: "user", content: p.prompt }], signal: controller.signal }, (event) => {
        if (event.type === "text") { streamed = true; callbacks = callbacks.then(() => this.sessions.dispatch(session.id, p.streamCallbackId, [{ value: event.delta }])).then(() => undefined); callbacks.catch(() => controller.abort()); }
      });
      await callbacks;
      if (!streamed && result.text) await this.sessions.dispatch(session.id, p.streamCallbackId, [{ value: result.text }]);
      return { text: result.text };
    } finally { session.streams.delete(p.streamId); }
  }
  private async oauthRedirect(raw: string): Promise<void> {
    try {
      const url = new URL(raw);
      if (!["opencast:", "surgecast:", "raycast:"].includes(url.protocol) || url.hostname !== "oauth") return;
      const state = url.searchParams.get("state"); if (!state) return;
      const flow = this.flows.get(state); if (!flow || flow.expires < Date.now()) return;
      this.flows.delete(state);
      const code = url.searchParams.get("code") ?? url.searchParams.get("authorizationCode");
      await this.sessions.dispatch(flow.sessionId, flow.callbackId, [url.searchParams.has("error") ? { error: url.searchParams.get("error_description") ?? url.searchParams.get("error") } : code ? { authorizationCode: code } : { error: "OAuth redirect did not contain an authorization code" }]);
    } catch { /* Malformed or stale redirects are ignored without logging tokens. */ }
  }
}
export function clipboard(contents: any): ClipboardContent {
  if (typeof contents === "string" || typeof contents === "number") return { kind: "text", text: String(contents) };
  if (typeof contents?.file === "string") return { kind: "file", paths: [contents.file] };
  if (typeof contents?.text === "string" || typeof contents?.html === "string") return { kind: "text", text: contents.text ?? "", html: contents.html };
  throw new Error("Invalid clipboard contents");
}
function noteData(note: any) { return { id: note.id, title: note.title, createdAt: new Date(note.createdAt).toISOString(), updatedAt: new Date(note.updatedAt).toISOString() }; }
export async function resolveModel(ctx: AppContext, selector: string | { id: string }): Promise<string> {
  const id = typeof selector === "string" ? selector : selector.id;
  const alias = ctx.entities.get<{ ref: string }>("localState", `ext:model:${id}`)?.data.ref;
  const models: AIModelOption[] = await ctx.ai.listModels();
  const matching = models.find((x) => x.ref === (alias ?? id) || x.modelId === id || x.modelId === id.replace(/^(openai|anthropic|google|xai|perplexity|mistral)-/, ""));
  if (!matching) throw new Error(`Extension AI model '${id}' is not configured. Configure a provider or an extension model alias.`);
  return matching.ref;
}

function validDecision(answer: any, question: any): boolean {
  if (!answer || answer.type !== question.type) return false;
  const probability = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
  if (answer.type === "noul") return probability(answer.noul);
  if (!probability(answer.confidence) || !answer.probabilities || !Object.values(answer.probabilities).every(probability)) return false;
  if (answer.type === "choice") return typeof answer.choice === "string" && answer.choice in question.criteria && Object.keys(question.criteria).every((key) => probability(answer.probabilities[key]));
  if (answer.type === "score") return Number.isFinite(answer.score) && answer.score >= 0 && answer.legend && typeof answer.legend === "object";
  return false;
}

function visibleFrameForWindow(frame: ScreenInfo["frame"], screens: ScreenInfo[]): ScreenInfo["frame"] {
  // NSScreen uses bottom-left Cocoa points. AX uses the primary display's top-left.
  // Match WindowManager's display selection by intersecting visible frames in AX space.
  const desktopTop = screens[0].frame.y + screens[0].frame.height;
  const visible = screens.map(({ visibleFrame: v }) => ({ ...v, y: desktopTop - v.y - v.height }));
  const overlap = (v: ScreenInfo["frame"]) => Math.max(0, Math.min(frame.x + frame.width, v.x + v.width) - Math.max(frame.x, v.x)) * Math.max(0, Math.min(frame.y + frame.height, v.y + v.height) - Math.max(frame.y, v.y));
  return visible.reduce((best, v) => overlap(v) > overlap(best) ? v : best);
}
