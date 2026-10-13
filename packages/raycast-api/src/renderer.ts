import React from "react";
import Reconciler from "react-reconciler";
import { DefaultEventPriority } from "react-reconciler/constants";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import type { UINode } from "@opencast/protocol";
import { environment } from "./environment";
import { replaceNodeHandlers, reportError, sendTree } from "./bridge";
import { NavigationStack } from "./navigation";
import { Detail } from "./components";
export interface Instance { type: string; props: Record<string, any>; children: Instance[]; hidden?: boolean; }
interface Container { children: Instance[]; commit(): void; }
const hostContext = {};
let priority = DefaultEventPriority;
const hostConfig = {
  rendererVersion: "0.1.0", rendererPackageName: "opencast",
  isPrimaryRenderer: true, supportsPersistence: true, supportsMutation: false, supportsHydration: false,
  supportsMicrotasks: true, scheduleMicrotask: queueMicrotask,
  getRootHostContext: () => hostContext, getChildHostContext: () => hostContext,
  getPublicInstance: (instance: Instance) => instance,
  prepareForCommit: () => null, resetAfterCommit: (container: Container) => container.commit(),
  createInstance: (type: string, props: Record<string, any>): Instance => ({ type, props, children: [] }),
  createTextInstance: (text: string): Instance => ({ type: "__text", props: { text }, children: [] }),
  appendInitialChild: (parent: Instance, child: Instance) => { parent.children.push(child); },
  finalizeInitialChildren: () => false, shouldSetTextContent: () => false,
  cloneInstance: (instance: Instance, _type: string, _old: unknown, props: Record<string, any>, keepChildren: boolean): Instance => ({ ...instance, props, children: keepChildren ? instance.children : [] }),
  createContainerChildSet: () => [] as Instance[],
  appendChildToContainerChildSet: (set: Instance[], child: Instance) => { set.push(child); },
  finalizeContainerChildren: () => {},
  replaceContainerChildren: (container: Container, set: Instance[]) => { container.children = set; },
  cloneHiddenInstance: (instance: Instance): Instance => ({ ...instance, hidden: true }),
  cloneHiddenTextInstance: (instance: Instance): Instance => ({ ...instance, hidden: true }),
  scheduleTimeout: setTimeout, cancelTimeout: clearTimeout, noTimeout: -1,
  setCurrentUpdatePriority: (value: number) => { priority = value; }, getCurrentUpdatePriority: () => priority, resolveUpdatePriority: () => priority || DefaultEventPriority,
  maySuspendCommit: () => false, maySuspendCommitOnUpdate: () => false, maySuspendCommitInSyncRender: () => false,
  preloadInstance: () => true, startSuspendingCommit: () => {}, suspendInstance: () => {}, waitForCommitToBeReady: () => null,
  getSuspendedCommitReason: () => null, NotPendingTransition: null, HostTransitionContext: React.createContext(null),
  resetFormInstance: () => {}, bindToConsole: (_method: string, args: unknown[]) => () => console.error(...args),
  getInstanceFromNode: () => null, preparePortalMount: () => {}, detachDeletedInstance: () => {},
  trackSchedulerEvent: () => {}, resolveEventType: () => null, resolveEventTimeStamp: () => -1, shouldAttemptEagerTransition: () => false,
};
// react-reconciler's public HostConfig types lag its persistence signatures.
const reconciler = (Reconciler as any)(hostConfig);
const iconProps = new Set(["icon", "content", "source", "fallback", "fileIcon", "providerIcon"]);
function asset(value: string): string {
  if (!environment.assetsPath || isAbsolute(value) || /^[a-z][a-z\d+.-]*:/i.test(value)) return value;
  const path = resolve(environment.assetsPath, value);
  return existsSync(path) ? path : value;
}
export function serialize(instances: Instance[]): { root: UINode | null; depth: number; handlers: Map<string, (...args: any[]) => unknown> } {
  const handlers = new Map<string, (...args: any[]) => unknown>();
  const stack = instances.find((x) => x.type === "__stack");
  const routes = stack?.children ?? [];
  const top = stack ? routes.at(-1)?.children ?? [] : instances;
  function value(input: any, path: string, key: string, seen = new Set<object>()): any {
    if (input === undefined || typeof input === "symbol") return undefined;
    if (typeof input === "function") { handlers.set(path, input); return { $handler: path }; }
    if (input instanceof Date) return { $date: input.toISOString() };
    if (input instanceof URL) return input.href;
    if (typeof input === "string") return iconProps.has(key) ? asset(input) : input;
    if (input === null || typeof input === "boolean" || typeof input === "number") return input;
    if (typeof input === "bigint") return String(input);
    if (React.isValidElement(input)) {
      const type = typeof input.type === "string" ? input.type : (input.type as any).displayName;
      if (!type || !/^(?:List|Grid|Detail|Form|Action|ActionPanel|MenuBarExtra)(?:\.|$)/.test(type)) return undefined;
      const props = input.props as Record<string, unknown>;
      return node({ type, props, children: React.Children.toArray(props.children as React.ReactNode).filter(React.isValidElement).map((child: any, i) => ({ type: typeof child.type === "string" ? child.type : child.type.displayName ?? "__deferred", props: child.props, children: [] })) }, path);
    }
    if (typeof input === "object") {
      if (seen.has(input)) throw new Error(`Circular extension prop at ${path}`);
      const nested = new Set(seen); nested.add(input);
      if (Array.isArray(input)) return input.map((v, i) => value(v, `${path}.${i}`, key, nested));
      return Object.fromEntries(Object.entries(input).map(([k, v]) => [k, value(v, `${path}.${k}`, ["light", "dark", "value"].includes(k) && iconProps.has(key) ? key : k, nested)]).filter(([, v]) => v !== undefined));
    }
    return undefined;
  }
  function node(instance: Instance, position: string, parentMenuId = "", itemIds?: Set<string>): UINode | null {
    if (instance.hidden || instance.type.startsWith("__")) return null;
    const isMenu = instance.type.startsWith("MenuBarExtra");
    const id = isMenu ? createHash("sha256").update(`${parentMenuId}/${instance.type}/${instance.props.title ?? ""}/${position}`).digest("hex").slice(0, 24) : String(instance.props.id ?? position);
    if (instance.type === "List" || instance.type === "Grid") itemIds = new Set<string>();
    if ((instance.type === "List.Item" || instance.type === "Grid.Item") && itemIds) { if (itemIds.has(id)) return null; itemIds.add(id); }
    const props: Record<string, unknown> = {};
    for (const [key, input] of Object.entries(instance.props)) {
      if (["children", "ref"].includes(key)) continue;
      const serialized = value(input, `${id}.${key}`, key);
      if (serialized !== undefined) props[key] = serialized;
    }
    const children: UINode[] = [];
    instance.children.forEach((child, index) => {
      if (child.type === "__prop") {
        const childNode = child.children.map((x, i) => node(x, `${position}.prop:${child.props.name}.${i}`, id, itemIds)).find(Boolean);
        if (childNode) props[child.props.name] = childNode;
      } else { const childNode = node(child, `${position}.${index}`, id, itemIds); if (childNode) children.push(childNode); }
    });
    return { type: instance.type, id, props, children };
  }
  const root = top.map((x, i) => node(x, `root.${i}`)).find(Boolean) ?? null;
  return { root, depth: Math.max(1, routes.length), handlers };
}
class ErrorBoundary extends React.Component<{ children?: React.ReactNode }, { message?: string }> {
  override state: { message?: string } = {};
  static getDerivedStateFromError(error: Error) { return { message: error.message }; }
  override componentDidCatch(error: Error) { reportError(error); }
  override render() { return this.state.message ? React.createElement(Detail, { markdown: `# Extension failed\n\n${this.state.message}` }) : this.props.children; }
}
export class ExtensionRenderer {
  private readonly container: Container;
  private readonly root: any;
  private timer?: NodeJS.Timeout;
  private disposed = false;
  private controller: Parameters<typeof NavigationStack>[0]["controller"] = { depth: 1 };
  constructor(private readonly onTree: (root: UINode | null, depth: number) => void = sendTree) {
    this.container = { children: [], commit: () => {
      if (!this.timer && !this.disposed) this.timer = setTimeout(() => { this.timer = undefined; this.flush(); }, 16);
    } };
    const onError = (error: unknown) => reportError(error);
    this.root = reconciler.createContainer(this.container, 1, null, false, null, "sc", onError, () => {}, (error: unknown) => reportError(error, false), null);
  }
  render(element: React.ReactNode): void {
    const tree = React.createElement(ErrorBoundary, {}, React.createElement(React.Suspense, { fallback: React.createElement(Detail, { markdown: "", isLoading: true }) }, React.createElement(NavigationStack, { element, controller: this.controller })));
    reconciler.updateContainer(tree, this.root, null, null);
  }
  flush(): void {
    if (this.disposed) return;
    const tree = serialize(this.container.children); replaceNodeHandlers(tree.handlers); this.onTree(tree.root, tree.depth);
  }
  pop(): boolean {
    if (this.controller.depth <= 1) return true;
    this.controller.current?.pop(); return false;
  }
  dispose(): void {
    this.disposed = true; clearTimeout(this.timer);
    reconciler.updateContainerSync(null, this.root, null, null); reconciler.flushSyncWork(); replaceNodeHandlers(new Map());
  }
}
