import { vi } from "vitest";
import type { BackendMethods, AIStreamEvent } from "@surgecast/protocol";
import type { AppContext } from "../../src/context";
import type { NativeApi } from "../../src/native/client";
import { Database } from "../../src/db/database";
import { EntityStore, entitiesMigration } from "../../src/db/entities";
import { EventBus } from "../../src/events";
import {
  SettingsService,
  settingsMigration,
} from "../../src/services/settings";
import { SecretsService } from "../../src/services/secrets";
import { RpcRegistry } from "../../src/rpc/registry";
import { DefaultCommandRegistry } from "../../src/registries/commands";
import { DefaultToolRegistry } from "../../src/registries/tools";
import { unconfiguredAI } from "../../src/registries/ai-unconfigured";
import { createLogger } from "../../src/util/log";
import { aiService } from "../../src/services/ai";
export async function harness() {
  const db = new Database(":memory:");
  db.addMigrations(entitiesMigration, settingsMigration);
  db.migrate();
  const events = new EventBus(),
    entities = new EntityStore(db),
    ready: (() => void | Promise<void>)[] = [],
    shutdown: (() => void | Promise<void>)[] = [],
    keys = new Map<string, string>();
  const nativeCall = vi.fn(async (method: string, p: any) => {
    if (method === "keychain.get") return keys.get(p.account) ?? null;
    if (method === "keychain.set") {
      keys.set(p.account, p.value);
      return;
    }
    if (method === "keychain.delete") {
      keys.delete(p.account);
      return;
    }
    if (method === "input.selectedText") return "Selected words";
    if (method === "clipboard.read")
      return {
        text: "Clipboard words",
        primary: { kind: "text", text: "Clipboard words" },
      };
    if (method === "apps.frontmost") return { name: "TextEdit" };
    if (method === "calendar.events") return [];
  });
  const native: NativeApi = {
    available: true,
    call: nativeCall as NativeApi["call"],
    on: () => () => {},
    serve: () => {},
    notify: () => {},
  };
  const ctx: AppContext = {
    db,
    entities,
    events,
    native,
    dataDir: "/tmp/ai-test",
    resourcesDir: ".",
    dev: true,
    version: "test",
    settings: new SettingsService(db, entities, events),
    secrets: new SecretsService(native),
    commands: new DefaultCommandRegistry(entities, events),
    tools: new DefaultToolRegistry(),
    ai: unconfiguredAI,
    launcher: { toast: () => {}, hud: async () => {}, navigate: () => {} },
    rpc: new RpcRegistry<BackendMethods>(),
    log: createLogger("ai-test"),
    registerHttpRoute: () => {},
    onReady: (f) => ready.push(f),
    onShutdown: (f) => shutdown.push(f),
  };
  const streamEvents: AIStreamEvent[] = [];
  events.on("ai.stream", (e) => streamEvents.push(e));
  aiService.register(ctx);
  for (const f of ready) await f();
  const rpc = async <M extends keyof BackendMethods>(
    method: M,
    params: BackendMethods[M]["params"] extends void
      ? void | Record<string, never>
      : BackendMethods[M]["params"],
  ): Promise<BackendMethods[M]["result"]> =>
    ctx.rpc.invoke(method, params, {
      connectionId: "test",
      signal: new AbortController().signal,
    }) as Promise<BackendMethods[M]["result"]>;
  const terminal = async (streamId: string) => {
    for (let i = 0; i < 500; i++) {
      const found = streamEvents.find(
        (e) =>
          e.streamId === streamId && (e.type === "done" || e.type === "error"),
      );
      if (found) return found;
      await new Promise((r) => setTimeout(r, 5));
    }
    throw new Error("Stream did not complete");
  };
  return {
    ctx,
    rpc,
    keys,
    nativeCall,
    streamEvents,
    terminal,
    async close() {
      for (const f of shutdown.reverse()) await f();
      db.close();
    },
  };
}
export function sseResponse(frames: unknown[], trailing = true): Response {
  return new Response(
    frames
      .map(
        (frame) =>
          `data: ${typeof frame === "string" ? frame : JSON.stringify(frame)}\n\n`,
      )
      .join("") + (trailing ? "data: [DONE]\n\n" : ""),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}
export function completion(text: string, tokens = 2): Response {
  return sseResponse([
    {
      choices: [{ delta: { content: text }, finish_reason: "stop" }],
      usage: { prompt_tokens: 3, completion_tokens: tokens },
    },
  ]);
}
export const configuredProvider = {
  name: "Local Mock",
  template: "custom",
  api: "openai" as const,
  baseUrl: "http://127.0.0.1:9876/v1",
  autoFetchModels: false,
  models: [
    {
      id: "mock",
      name: "Mock",
      enabled: true,
      capabilities: { tools: true, vision: true },
    },
  ],
};
