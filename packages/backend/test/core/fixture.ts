import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { vi } from "vitest";
import type {
  BackendMethods,
  NativeEvents,
  BackendForNativeMethods,
} from "@surgecast/protocol";
import type { AppContext } from "../../src/context";
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
import type { NativeApi } from "../../src/native/client";
import { coreServices } from "../../src/services/core";
export async function fixture() {
  const dataDir = await mkdtemp(join(tmpdir(), "surgecast-core-test-"));
  const db = new Database(":memory:");
  db.addMigrations(entitiesMigration, settingsMigration);
  const entities = new EntityStore(db);
  const events = new EventBus();
  const nativeListeners = new Map<string, ((value: unknown) => void)[]>();
  const served = new Map<string, (p: never) => unknown>();
  const nativeCall = vi.fn(async (method: string): Promise<unknown> => {
    if (method === "apps.list")
      return [
        {
          name: "Safari",
          bundleId: "com.apple.Safari",
          path: "/Applications/Safari.app",
        },
        {
          name: "Terminal",
          bundleId: "com.apple.Terminal",
          path: "/System/Applications/Utilities/Terminal.app",
        },
      ];
    if (method === "hotkeys.register") return { ok: true };
    if (
      method === "clipboard.read" ||
      method === "input.selectedText" ||
      method === "apps.previous"
    )
      return null;
    if (method === "apps.running") return [];
    if (method === "alert.show") return { index: 0 };
    return undefined;
  });
  const native: NativeApi = {
    available: true,
    call: nativeCall as NativeApi["call"],
    on: (topic, listener) => {
      const bucket = nativeListeners.get(topic) ?? [];
      bucket.push(listener as (value: unknown) => void);
      nativeListeners.set(topic, bucket);
      return () => {
        const index = bucket.indexOf(listener as (value: unknown) => void);
        if (index >= 0) bucket.splice(index, 1);
      };
    },
    serve: (method, handler) => {
      served.set(method, handler as (p: never) => unknown);
    },
    notify: vi.fn(),
  };
  const ready: (() => unknown)[] = [];
  const shutdown: (() => unknown)[] = [];
  const ctx: AppContext = {
    dataDir,
    resourcesDir: dataDir,
    version: "0.1.0",
    dev: true,
    db,
    entities,
    events,
    settings: new SettingsService(db, entities, events),
    secrets: new SecretsService(native),
    rpc: new RpcRegistry<BackendMethods>(),
    commands: new DefaultCommandRegistry(entities, events),
    ai: unconfiguredAI,
    tools: new DefaultToolRegistry(),
    native,
    launcher: { toast: vi.fn(), hud: vi.fn(async () => {}), navigate: vi.fn() },
    log: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      child: vi.fn(),
    } as AppContext["log"],
    registerHttpRoute: vi.fn(),
    onReady: (f) => ready.push(f),
    onShutdown: (f) => shutdown.push(f),
  };
  for (const service of coreServices) service.register(ctx);
  db.migrate();
  for (const hook of ready) await hook();
  return {
    ctx,
    nativeCall,
    emit: <T extends keyof NativeEvents>(
      topic: T,
      payload: NativeEvents[T],
    ) => {
      for (const listener of nativeListeners.get(topic) ?? [])
        listener(payload);
    },
    nativeInvoke: <T extends keyof BackendForNativeMethods>(
      method: T,
      params: BackendForNativeMethods[T]["params"],
    ) => served.get(method)!(params as never),
    call: async <T extends keyof BackendMethods>(
      method: T,
      params: BackendMethods[T]["params"],
    ): Promise<BackendMethods[T]["result"]> =>
      ctx.rpc.invoke(method, params, {
        connectionId: "test",
        signal: new AbortController().signal,
      }) as Promise<BackendMethods[T]["result"]>,
    close: async () => {
      for (const hook of shutdown.reverse()) await hook();
      db.close();
      await rm(dataDir, { force: true, recursive: true });
    },
  };
}
