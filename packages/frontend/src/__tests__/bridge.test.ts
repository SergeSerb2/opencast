import { describe, expect, it, vi } from "vitest";
import { RpcErrorCode } from "@surgecast/protocol";
import { WebSocketBackend, defaultTimeout, reconnectDelay } from "../bridge/backend";
import { resolveEnvironment } from "../bridge/env";
import { refetchRulesFor } from "../bridge/refetch";

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {
    FakeSocket.instances.push(this);
  }
  send(frame: string) {
    this.sent.push(frame);
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  reply(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

vi.stubGlobal("WebSocket", Object.assign(FakeSocket, { OPEN: 1 }));

function setup() {
  FakeSocket.instances = [];
  const client = new WebSocketBackend("ws://x/rpc?token=t", (url) => new FakeSocket(url) as unknown as WebSocket);
  return { client, socket: () => FakeSocket.instances[FakeSocket.instances.length - 1] };
}

describe("WebSocketBackend", () => {
  it("queues calls until open, then resolves responses", async () => {
    const { client, socket } = setup();
    const pending = client.call("search.root", { query: "clip" });
    expect(socket().sent).toHaveLength(0);
    socket().open();
    const frame = JSON.parse(socket().sent[0]);
    expect(frame).toMatchObject({ jsonrpc: "2.0", method: "search.root", params: { query: "clip" } });
    socket().reply({ jsonrpc: "2.0", id: frame.id, result: { query: "clip", sections: [], fallbacks: [] } });
    await expect(pending).resolves.toEqual({ query: "clip", sections: [], fallbacks: [] });
  });

  it("rejects with the RPC error", async () => {
    const { client, socket } = setup();
    socket().open();
    const pending = client.call("commands.get", { id: "nope" });
    const frame = JSON.parse(socket().sent[0]);
    socket().reply({ jsonrpc: "2.0", id: frame.id, error: { code: RpcErrorCode.NotFound, message: "missing" } });
    await expect(pending).rejects.toMatchObject({ code: RpcErrorCode.NotFound, message: "missing" });
  });

  it("sends $/cancel when aborted after sending", async () => {
    const { client, socket } = setup();
    socket().open();
    const controller = new AbortController();
    const pending = client.call("search.root", { query: "a" }, { signal: controller.signal });
    const { id } = JSON.parse(socket().sent[0]);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ code: RpcErrorCode.Cancelled });
    expect(JSON.parse(socket().sent[1])).toEqual({ jsonrpc: "2.0", method: "$/cancel", params: { id } });
  });

  it("delivers events and reconnects after a drop", async () => {
    vi.useFakeTimers();
    const { client, socket } = setup();
    const seen: unknown[] = [];
    client.on("commands.changed", (p) => seen.push(p));
    socket().open();
    socket().reply({ jsonrpc: "2.0", method: "event", params: { topic: "commands.changed", payload: { reason: "x" } } });
    expect(seen).toEqual([{ reason: "x" }]);
    const inflight = client.call("search.root", { query: "" });
    socket().close();
    await expect(inflight).rejects.toMatchObject({ message: expect.stringContaining("Lost connection") });
    expect(client.getState()).toBe("reconnecting");
    vi.advanceTimersByTime(400);
    expect(FakeSocket.instances).toHaveLength(2);
    socket().open();
    expect(client.getState()).toBe("open");
    vi.useRealTimers();
  });

  it("uses long timeouts for slow methods and bounded backoff", () => {
    expect(defaultTimeout("extensions.install")).toBeGreaterThan(defaultTimeout("search.root"));
    expect(reconnectDelay(0, () => 0.5)).toBe(250);
    expect(reconnectDelay(10, () => 0.5)).toBe(5000);
  });
});

describe("resolveEnvironment", () => {
  it("prefers the injected object, then URL params, else mock", () => {
    const injected = resolveEnvironment({ injected: { backendUrl: "ws://h/rpc", token: "t", window: "notes", macOSMajor: 26 }, search: "", pathname: "/main.html", hasNativeHandler: true });
    expect(injected).toMatchObject({ backendUrl: "ws://h/rpc", window: "notes", native: true, mock: false, macOSMajor: 26 });
    const url = resolveEnvironment({ search: "?backend=ws://127.0.0.1:9/rpc&token=abc&appearance=light", pathname: "/settings.html", hasNativeHandler: false });
    expect(url).toMatchObject({ token: "abc", window: "settings", mock: false, dev: true, appearanceOverride: "light" });
    expect(resolveEnvironment({ search: "", pathname: "/ai-chat.html", hasNativeHandler: false })).toMatchObject({ mock: true, window: "ai-chat" });
    expect(resolveEnvironment({ search: "?backend=ws://x&token=t&mock=1", pathname: "/", hasNativeHandler: false }).mock).toBe(true);
  });
});

describe("refetch rules", () => {
  it("maps methods to invalidating events", () => {
    expect(refetchRulesFor("clipboard.list").map((r) => r.topic)).toEqual(["clipboard.changed"]);
    const snippets = refetchRulesFor("snippets.list")[0];
    expect(snippets.topic).toBe("entities.changed");
    const when = snippets.when as (p: { collection: string }) => boolean;
    expect(when({ collection: "snippets" })).toBe(true);
    expect(when({ collection: "notes" })).toBe(false);
    expect(refetchRulesFor("calc.evaluate")).toEqual([]);
  });
});
