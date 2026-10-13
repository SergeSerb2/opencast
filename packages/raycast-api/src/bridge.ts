import { randomUUID } from "node:crypto";
import type { UINode } from "@surgecast/protocol";

export interface Initialization {
  sessionId: string;
  extensionName: string;
  commandName: string;
  ownerOrAuthorName: string;
  entryPointType: "command" | "tool";
  mode: "view" | "no-view" | "menu-bar";
  entryPath: string;
  assetsPath: string;
  supportPath: string;
  preferences: Record<string, unknown>;
  launchProps: Record<string, unknown>;
  isDevelopment: boolean;
  appearance: "light" | "dark";
  aiAvailable: boolean;
  namedExport?: string;
  input?: unknown;
}
export type Request = (method: string, params?: Record<string, unknown>) => Promise<any>;
export let initialization: Initialization = {
  sessionId: "test", extensionName: "test", commandName: "test", ownerOrAuthorName: "",
  entryPointType: "command", mode: "view", entryPath: "", assetsPath: "", supportPath: "",
  preferences: {}, launchProps: {}, isDevelopment: false, appearance: "dark", aiAvailable: false,
};
let requester: Request = async (method) => { throw new Error(`${method} requires an extension host`); };
let notifier: (method: string, params: unknown) => void = () => {};
export function configure(options: Initialization, request: Request, notify: typeof notifier): void {
  initialization = options;
  requester = request;
  notifier = notify;
}
export const request: Request = (method, params = {}) => requester(method, params);
export function notify(method: string, params: unknown = {}): void { notifier(method, params); }
export const randomId = () => randomUUID();
const apiHandlers = new Map<string, (...args: any[]) => unknown>();
let nodeHandlers = new Map<string, (...args: any[]) => unknown>();
export function registerCallback(callback: (...args: any[]) => unknown, id = randomId()): string {
  apiHandlers.set(id, callback);
  return id;
}
export function removeCallback(id: string): void { apiHandlers.delete(id); }
export function replaceNodeHandlers(handlers: typeof nodeHandlers): void { nodeHandlers = handlers; }
export async function dispatch(id: string, args: unknown[] = []): Promise<unknown> {
  const fn = nodeHandlers.get(id) ?? apiHandlers.get(id);
  if (!fn) throw new Error(`Extension callback is no longer available: ${id}`);
  return fn(...revive(args));
}
export function revive<T>(value: T): T {
  if (Array.isArray(value)) return value.map(revive) as T;
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.$date === "string") return new Date(v.$date) as T;
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, revive(x)])) as T;
  }
  if (typeof value === "string") {
    if (value.startsWith("__raycast_serialized_date__")) return new Date(value.slice(26)) as T;
    if (value.startsWith("__raycast_serialized_buffer__")) return Buffer.from(value.slice(28), "base64") as T;
  }
  return value;
}
export function reportError(error: unknown, fatal = true): void {
  const message = error instanceof Error ? error.message : String(error);
  notify(fatal ? "commandException" : "captureException", { message });
}
export function sendTree(root: UINode | null, depth: number): void {
  notify("render", { root, depth, isLoading: root?.props.isLoading === true, navigationTitle: root?.props.navigationTitle });
}
