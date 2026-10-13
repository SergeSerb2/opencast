import type { HandlerRef, UINode } from "@opencast/protocol";
import { deserializeValue } from "../components/Form/serialize";

/** Dispatches a HandlerRef to the extension runtime with JS arguments. */
export type Dispatch = (handler: HandlerRef, args?: unknown[]) => void;

export function isHandler(value: unknown): value is HandlerRef {
  return typeof value === "object" && value !== null && typeof (value as HandlerRef).$handler === "string";
}

export function isNode(value: unknown): value is UINode {
  return typeof value === "object" && value !== null && typeof (value as UINode).type === "string" && Array.isArray((value as UINode).children);
}

/** Recursively turn `{ $date }` values back into Dates (accessories, date pickers). */
export function revive<T>(value: T): T {
  if (Array.isArray(value)) return value.map(revive) as T;
  if (value && typeof value === "object" && !isNode(value) && !isHandler(value)) {
    const date = deserializeValue(value);
    if (date instanceof Date || date === null) return date as T;
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, revive(v)])) as T;
  }
  return value;
}

export function str(value: unknown): string | undefined {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : undefined;
}

export function bool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

/** Wrap an optional HandlerRef as a callback. */
export function callback<A extends unknown[]>(value: unknown, dispatch: Dispatch, map: (...args: A) => unknown[] = (...args) => args): ((...args: A) => void) | undefined {
  if (!isHandler(value)) return undefined;
  return (...args: A) => dispatch(value, map(...args));
}

/** Children of a node whose type is one of `types` (exact match). */
export function childrenOfType(node: UINode, ...types: string[]): UINode[] {
  return node.children.filter((c) => types.includes(c.type));
}

/** The id an extension sees for list/grid items: the `id` prop, else the node id. */
export function itemId(node: UINode): string {
  return str(node.props.id) ?? node.id;
}
