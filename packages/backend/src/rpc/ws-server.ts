import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";
import { EVENT_METHOD, RpcErrorCode, type RpcMessage } from "@surgecast/protocol";
import type { RpcRegistry, MethodSpec } from "./registry";
import type { EventBus } from "../events";
import { toRpcErrorObject } from "../util/errors";
import { createLogger } from "../util/log";

const log = createLogger("ws");

export type HttpRoute = (req: IncomingMessage, res: ServerResponse, url: URL) => void | Promise<void>;

interface Connection {
  id: string;
  window?: string;
  socket: WebSocket;
  inflight: Map<string | number, AbortController>;
}

export interface WsServerOptions {
  host?: string;
  port?: number;
  token: string;
  /** Extra origins allowed besides surgecast-app:// and localhost dev servers. */
  allowedOrigins?: string[];
}

/**
 * JSON-RPC over WebSocket for the frontend windows, plus a few authenticated
 * HTTP routes (`registerRoute`) used by the browser dev mode and by streaming
 * downloads. Every request needs the per-launch token.
 */
export class WsRpcServer {
  private readonly connections = new Map<string, Connection>();
  private readonly routes = new Map<string, HttpRoute>();
  private server?: ReturnType<typeof createServer>;
  private wss?: WebSocketServer;
  port = 0;

  constructor(
    private readonly registry: RpcRegistry<{ [k: string]: MethodSpec }>,
    private readonly events: EventBus,
    private readonly options: WsServerOptions,
  ) {
    events.addSink((topic, payload) => this.broadcast(topic, payload));
  }

  registerRoute(path: string, route: HttpRoute): void {
    this.routes.set(path, route);
  }

  async listen(): Promise<number> {
    const server = createServer((req, res) => void this.onHttp(req, res));
    const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024 });
    server.on("upgrade", (req, socket, head) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/rpc" || url.searchParams.get("token") !== this.options.token) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      wss.handleUpgrade(req, socket, head, (ws) => this.onConnection(ws, url.searchParams.get("window") ?? undefined));
    });
    this.server = server;
    this.wss = wss;
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(this.options.port ?? 0, this.options.host ?? "127.0.0.1", () => resolve());
    });
    this.port = (server.address() as AddressInfo).port;
    log.info(`listening on 127.0.0.1:${this.port}`);
    return this.port;
  }

  async close(): Promise<void> {
    for (const c of this.connections.values()) c.socket.close();
    await new Promise<void>((resolve) => (this.wss ? this.wss.close(() => resolve()) : resolve()));
    await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
  }

  /** Push an event to every window, or only to windows of one kind. */
  broadcast(topic: string, payload: unknown, window?: string): void {
    const frame = JSON.stringify({ jsonrpc: "2.0", method: EVENT_METHOD, params: { topic, payload } });
    for (const c of this.connections.values()) {
      if (window && c.window !== window) continue;
      if (c.socket.readyState === c.socket.OPEN) c.socket.send(frame);
    }
  }

  connectedWindows(): string[] {
    return [...this.connections.values()].map((c) => c.window ?? "unknown");
  }

  private onConnection(socket: WebSocket, window?: string): void {
    const conn: Connection = { id: randomUUID(), window, socket, inflight: new Map() };
    this.connections.set(conn.id, conn);
    log.debug(`connected ${window ?? "?"} (${conn.id})`);
    socket.on("message", (data) => void this.onMessage(conn, data.toString()));
    socket.on("close", () => {
      for (const ctrl of conn.inflight.values()) ctrl.abort();
      this.connections.delete(conn.id);
      log.debug(`disconnected ${window ?? "?"} (${conn.id})`);
    });
    socket.on("error", (err) => log.warn("socket error", err));
  }

  private async onMessage(conn: Connection, raw: string): Promise<void> {
    let msg: RpcMessage;
    try {
      msg = JSON.parse(raw) as RpcMessage;
    } catch {
      conn.socket.send(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: RpcErrorCode.ParseError, message: "Parse error" } }));
      return;
    }
    if (!("method" in msg)) return; // the frontend never answers server requests
    if (msg.method === "$/cancel") {
      const id = (msg.params as { id?: string | number } | undefined)?.id;
      if (id !== undefined) conn.inflight.get(id)?.abort();
      return;
    }
    const id = "id" in msg ? msg.id : undefined;
    const ctrl = new AbortController();
    if (id !== undefined && id !== null) conn.inflight.set(id, ctrl);
    try {
      const result = await this.registry.invoke(msg.method, msg.params, {
        connectionId: conn.id,
        window: conn.window,
        signal: ctrl.signal,
      });
      if (id !== undefined && id !== null) this.send(conn, { jsonrpc: "2.0", id, result: result ?? null });
    } catch (error) {
      const err = toRpcErrorObject(error);
      if (err.code === RpcErrorCode.InternalError) log.error(`${msg.method} failed`, error);
      if (id !== undefined && id !== null) this.send(conn, { jsonrpc: "2.0", id, error: err });
    } finally {
      if (id !== undefined && id !== null) conn.inflight.delete(id);
    }
  }

  private send(conn: Connection, message: unknown): void {
    if (conn.socket.readyState === conn.socket.OPEN) conn.socket.send(JSON.stringify(message));
  }

  private async onHttp(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    res.setHeader("Access-Control-Allow-Origin", "*");
    if (url.pathname === "/health") {
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true }));
      return;
    }
    if (url.searchParams.get("token") !== this.options.token) {
      res.writeHead(401).end("unauthorized");
      return;
    }
    const route = this.routes.get(url.pathname);
    if (!route) {
      res.writeHead(404).end("not found");
      return;
    }
    try {
      await route(req, res, url);
    } catch (error) {
      log.error(`route ${url.pathname} failed`, error);
      if (!res.headersSent) res.writeHead(500);
      res.end();
    }
  }
}
