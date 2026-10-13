/**
 * JSON-RPC 2.0 envelopes used on every Surgecast channel:
 *
 *   frontend (WKWebView) <-> backend (Node)    WebSocket, one JSON message per frame
 *   backend (Node)       <-> native (Swift)    stdio, newline-delimited JSON (NDJSON)
 *   frontend (WKWebView)  -> native (Swift)    WKScriptMessageHandlerWithReply ("native")
 *
 * Both sides of every channel may send requests and notifications.
 */

export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONValue[] | { [key: string]: JSONValue };

export interface RpcRequest<P = unknown> {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: P;
}

export interface RpcNotification<P = unknown> {
  jsonrpc: "2.0";
  method: string;
  params?: P;
}

export interface RpcSuccess<R = unknown> {
  jsonrpc: "2.0";
  id: number | string;
  result: R;
}

export interface RpcErrorObject {
  code: number;
  message: string;
  data?: unknown;
}

export interface RpcFailure {
  jsonrpc: "2.0";
  id: number | string | null;
  error: RpcErrorObject;
}

export type RpcMessage = RpcRequest | RpcNotification | RpcSuccess | RpcFailure;

export const RpcErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  /** The native host is not attached (e.g. browser dev mode). */
  NativeUnavailable: -32001,
  /** A macOS permission (Accessibility, Calendar, ...) is missing. */
  PermissionDenied: -32002,
  NotFound: -32004,
  Cancelled: -32005,
  Unauthorized: -32006,
  /** Remote provider error (AI provider, sync server, store). */
  Upstream: -32010,
} as const;

/** Notification method used for every backend -> frontend push event. */
export const EVENT_METHOD = "event";

export interface EventEnvelope<T extends string = string, P = unknown> {
  topic: T;
  payload: P;
}

export function isRequest(m: RpcMessage): m is RpcRequest {
  return "method" in m && "id" in m && m.id !== undefined && m.id !== null;
}

export function isNotification(m: RpcMessage): m is RpcNotification {
  return "method" in m && !("id" in m && m.id !== undefined && m.id !== null);
}

export function isResponse(m: RpcMessage): m is RpcSuccess | RpcFailure {
  return !("method" in m) && ("result" in m || "error" in m);
}
