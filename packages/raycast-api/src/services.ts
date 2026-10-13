import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { realpathSync } from "node:fs";
import { registerCallback, removeCallback, reportError, request, notify, randomId } from "./bridge";
import { setCapability } from "./environment";

export function pathString(path: any): string {
  if (Buffer.isBuffer(path)) throw new Error("Buffer file paths are not supported");
  const text = path instanceof URL ? fileURLToPath(path) : String(path);
  return text.startsWith("~/") ? resolve(homedir(), text.slice(2)) : text;
}
function clipboardContent(content: any) {
  if (typeof content === "string" || typeof content === "number") return { text: String(content) };
  if (!content || typeof content !== "object") throw new Error("Invalid clipboard content");
  return content.file ? { ...content, file: realpathSync(pathString(content.file)) } : content;
}
export const Clipboard = {
  copy: (content: any, options: { concealed?: boolean; transient?: boolean } = {}) => request("setClipboard", { contents: clipboardContent(content), concealed: options.concealed || options.transient || false, transient: options.transient }),
  clear: () => request("clearClipboard"),
  paste: (content: any) => request("paste", { contents: clipboardContent(content) }),
  read: (options: { offset?: number } = {}) => request("getClipboard", { offset: options.offset ?? 0 }),
  async readText(options?: { offset?: number }): Promise<string | undefined> { return (await Clipboard.read(options)).text ?? undefined; },
};
export const LocalStorage = {
  async allItems<T = Record<string, string | number | boolean>>(): Promise<T> { return (await request("allLocalStorageItems")).values; },
  async getItem<T = string | number | boolean>(key: string): Promise<T | undefined> { return (await request("getLocalStorageItem", { key })).value ?? undefined; },
  setItem(key: string, value: string | number | boolean) {
    if (!["string", "boolean", "number"].includes(typeof value) || (typeof value === "number" && !Number.isFinite(value))) return Promise.reject(new Error("LocalStorage values must be strings, finite numbers, or booleans"));
    return request("setLocalStorageItem", { key, value });
  },
  removeItem: (key: string) => request("removeLocalStorageItem", { key }),
  clear: () => request("clearLocalStorage"),
};
export const closeMainWindow = (options: Record<string, unknown> = {}) => request("closeMainRaycastWindow", { clearRootSearch: false, popToRootType: "default", ...options });
export const clearSearchBar = (options: Record<string, unknown> = {}) => request("clearSearchBar", { forceScrollToTop: true, ...options });
export const popToRoot = (options: Record<string, unknown> = {}) => request("popToRoot", { clearSearchBar: true, ...options });
export const showHUD = (title: string, options: Record<string, unknown> = {}) => request("showHUD", { title, clearRootSearch: false, popToRootType: "default", ...options });
export const open = (target: string, application?: any) => request("open", { path: pathString(target), app: typeof application === "string" ? application : application?.path ?? application?.bundleId ?? application?.localizedName ?? application?.name });
export const showInFinder = (path: any) => request("showInFinder", { path: pathString(path) });
export async function trash(paths: any): Promise<void> {
  const result = await request("trashItems", { paths: (Array.isArray(paths) ? paths : [paths]).map(pathString) });
  if (result.notTrashed.length) throw new Error(`Could not move to Trash: ${result.notTrashed.join(", ")}`);
}
export const launchCommand = (options: Record<string, unknown>) => request("launchCommand", options);
export const updateCommandMetadata = (metadata: { subtitle?: string | null }) => request("updateCommandMetadata", metadata);
export const openExtensionPreferences = () => request("openExtensionPreferences");
export const openCommandPreferences = () => request("openCommandPreferences");
export async function getSelectedText(): Promise<string> { return (await request("getSelectedText")).text; }
export async function getSelectedFinderItems(): Promise<{ path: string }[]> { return (await request("getSelectedFinderItems")).items; }
export async function getApplications(path?: any): Promise<any[]> { return (await request("getApplications", { path: path === undefined ? undefined : pathString(path) })).value; }
export async function getDefaultApplication(path: any): Promise<any> { return (await request("getDefaultApplication", { path: pathString(path) })).value; }
export async function getFrontmostApplication(): Promise<any> { return (await request("getFrontmostApplication")).value; }
export const captureException = (error: unknown) => reportError(error, false);
export const captureMemorySnapshot = (label: string) => notify("reportMemoryUsage", { label, ...process.memoryUsage() });

export const Alert = { ActionStyle: { Default: "default", Cancel: "cancel", Destructive: "destructive" } } as const;
export const AlertActionStyle = Alert.ActionStyle;
export async function confirmAlert(options: any): Promise<boolean> {
  const confirmed = await request("showAlert", { ...options, primaryAction: options.primaryAction && { title: options.primaryAction.title, style: options.primaryAction.style }, dismissAction: options.dismissAction && { title: options.dismissAction.title, style: options.dismissAction.style } });
  await (confirmed ? options.primaryAction?.onAction?.() : options.dismissAction?.onAction?.());
  return confirmed;
}
export class Toast {
  static Style = { Success: "SUCCESS", Failure: "FAILURE", Animated: "ANIMATED" } as const;
  readonly id = randomId();
  private options: any;
  private chain: Promise<any> = Promise.resolve();
  private callbacks: string[] = [];
  constructor(options: any = {}) { this.options = { style: Toast.Style.Success, ...options }; }
  get style() { return this.options.style; }
  set style(value) { this.options.style = value; this.update(); }
  get title() { return this.options.title; }
  set title(value) { this.options.title = value; this.update(); }
  get message() { return this.options.message; }
  set message(value) { this.options.message = value; this.update(); }
  get primaryAction() { return this.options.primaryAction; }
  set primaryAction(value) { this.options.primaryAction = value; this.update(); }
  get secondaryAction() { return this.options.secondaryAction; }
  set secondaryAction(value) { this.options.secondaryAction = value; this.update(); }
  private payload(): any {
    for (const id of this.callbacks) removeCallback(id);
    this.callbacks = [];
    const payload = { ...this.options, id: this.id };
    for (const key of ["primaryAction", "secondaryAction"] as const) {
      const action = this.options[key];
      if (!action) continue;
      const handler = action.onAction ? registerCallback(() => action.onAction(this), `toast:${this.id}:${key}`) : undefined;
      if (handler) this.callbacks.push(handler);
      payload[key] = { title: action.title, shortcut: action.shortcut, handler: handler ? { $handler: handler } : undefined };
    }
    return payload;
  }
  private enqueue(method: string): Promise<void> {
    const payload = this.payload();
    this.chain = this.chain.catch(() => {}).then(() => request(method, payload));
    return this.chain;
  }
  private update(): void { void this.enqueue("updateToast").catch((e) => reportError(e, false)); }
  async show(): Promise<void> { await this.enqueue("showToast"); }
  async hide(): Promise<void> {
    await this.enqueue("hideToast");
    for (const id of this.callbacks) removeCallback(id);
    await this.options.onHide?.();
  }
}
export const ToastStyle = Toast.Style;
export async function showToast(optionsOrStyle: any, title?: string, message?: string): Promise<Toast> {
  const toast = new Toast(typeof optionsOrStyle === "string" ? { style: optionsOrStyle, title, message } : optionsOrStyle);
  await toast.show(); return toast;
}
const browserUnavailable = async () => { throw new Error("BrowserExtension is not supported yet: OpenCast has no connected browser extension"); };
export const BrowserExtension = { getTabs: browserUnavailable, getContent: browserUnavailable, executeJavaScript: browserUnavailable };
setCapability("browser", BrowserExtension);
export const WindowManagement = {
  DesktopType: { User: "User", FullScreen: "FullScreen" },
  async getDesktops(): Promise<any[]> { return (await request("getDesktops")).desktops; },
  async getActiveWindow(): Promise<any> { return (await request("getActiveWindow")).window; },
  async getWindowsOnActiveDesktop(): Promise<any[]> { return (await request("getWindowsOnActiveDesktop")).windows; },
  setWindowBounds: (options: any) => request("setWindowBounds", options),
};
class Note {
  id: string; title: string; createdAt: Date; updatedAt: Date;
  constructor(data: any) { this.id = data.id; this.title = data.title; this.createdAt = new Date(data.createdAt); this.updatedAt = new Date(data.updatedAt); }
  async getContent(options: any = {}): Promise<string> { return (await request("readRaycastNote", { noteId: this.id, format: "markdown", ...options })).content; }
  async updateContent(content: string, options: any = {}): Promise<void> { const data = await request("updateRaycastNote", { noteId: this.id, content, format: "markdown", ...options }); this.title = data.title; this.updatedAt = new Date(data.updatedAt); }
  delete() { return request("deleteRaycastNote", { noteId: this.id }); }
  open() { return request("openRaycastNote", { noteId: this.id }); }
}
export const Notes = {
  Note,
  async create(content: string, options: any = {}): Promise<Note> { return new Note(await request("createRaycastNote", { content, format: "markdown", ...options })); },
  async search(query: string, options: any = {}): Promise<{ data: Note[]; hasMore: boolean }> { const result = await request("searchRaycastNotes", { query, page: 0, ...options }); return { ...result, data: result.data.map((x: any) => new Note(x)) }; },
};
