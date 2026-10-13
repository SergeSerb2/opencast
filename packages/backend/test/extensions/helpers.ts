import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { EventEmitter } from "node:events";
import { vi } from "vitest";
import type { AppContext } from "../../src/context";
import type { BackendMethods } from "@surgecast/protocol";
import { Database } from "../../src/db/database";
import { EntityStore, entitiesMigration } from "../../src/db/entities";
import { SettingsService, settingsMigration } from "../../src/services/settings";
import { SecretsService } from "../../src/services/secrets";
import { EventBus } from "../../src/events";
import { RpcRegistry } from "../../src/rpc/registry";
import { DefaultCommandRegistry } from "../../src/registries/commands";
import { DefaultToolRegistry } from "../../src/registries/tools";
import { unconfiguredAI } from "../../src/registries/ai-unconfigured";
import { ExtensionsHost } from "../../src/services/extensions";
export function harness() {
  const dataDir = mkdtempSync(join(tmpdir(), "surgecast-host-test-"));
  const db = new Database(":memory:"); db.addMigrations(entitiesMigration, settingsMigration);
  const entities = new EntityStore(db); const events = new EventBus(); const rpc = new RpcRegistry<BackendMethods>();
  const nativeEvents = new EventEmitter(); const secrets = new Map<string, string>();
  const nativeCalls = vi.fn(async (method: string, p: any) => {
    switch (method) {
      case "system.appearance": return "dark";
      case "keychain.get": return secrets.get(p.account) ?? null;
      case "keychain.set": secrets.set(p.account, p.value); return;
      case "keychain.delete": secrets.delete(p.account); return;
      case "apps.list": return [{ name: "Example", path: "/Applications/Example.app", bundleId: "app.example" }];
      case "alert.show": return { index: 0 };
      case "clipboard.read": return { text: "selected", primary: { kind: "text", text: "selected" } };
    }
  });
  const native = { available: true, call: nativeCalls, on: (topic: string, callback: any) => { nativeEvents.on(topic, callback); return () => nativeEvents.off(topic, callback); }, serve: vi.fn(), notify: vi.fn() } as any;
  const ready: (() => void | Promise<void>)[] = []; const shutdown: (() => void | Promise<void>)[] = [];
  const ctx: AppContext = {
    dataDir, resourcesDir: resolve("../.."), dev: true, version: "test", db, entities, settings: new SettingsService(db, entities, events), secrets: new SecretsService(native), native,
    commands: new DefaultCommandRegistry(entities, events), tools: new DefaultToolRegistry(), ai: { ...unconfiguredAI }, events, rpc,
    launcher: { hud: vi.fn(async () => {}), toast: vi.fn(), navigate: vi.fn() }, log: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() } as any,
    registerHttpRoute: vi.fn(), onReady: (fn) => ready.push(fn), onShutdown: (fn) => shutdown.push(fn),
  };
  const host = new ExtensionsHost(ctx); host.register(); db.migrate();
  return { ctx, host, secrets, nativeEvents, nativeCalls, dataDir,
    call: (method: string, params: unknown = {}) => rpc.invoke(method, params, { connectionId: "test", signal: new AbortController().signal }),
    ready: async () => { for (const fn of ready) await fn(); },
    close: async () => { for (const fn of shutdown.reverse()) await fn(); db.close(); },
  };
}
export function fixture(folder: string, overrides: Record<string, unknown> = {}, commands: Record<string, string> = {}) {
  const path = join(folder, `source-${Math.random().toString(36).slice(2)}`); mkdirSync(path, { recursive: true });
  const manifest = { name: "fixture", title: "Fixture", author: "test", commands: [{ name: "list", title: "List", mode: "view" }, { name: "task", title: "Task", mode: "no-view" }], ...overrides };
  writeFileSync(join(path, "package.json"), JSON.stringify(manifest));
  for (const command of manifest.commands as any[]) writeFileSync(join(path, `${command.name}.js`), commands[command.name] ?? (command.mode === "no-view" ? `exports.default=async()=>{const{LocalStorage}=require('@raycast/api');await LocalStorage.setItem('ran',true)}` : `const{List,ActionPanel,Action}=require('@raycast/api');const React=require('react');exports.default=()=>{const[text,setText]=React.useState('');return React.createElement(List,{onSearchTextChange:setText},React.createElement(List.Item,{id:'item',title:text||'Initial',actions:React.createElement(ActionPanel,{},React.createElement(Action,{title:'Update',onAction:()=>setText('Action')}))}))}`));
  return path;
}
export async function waitFor<T>(fn: () => T | undefined, timeout = 3000): Promise<T> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = fn(); if (value !== undefined) return value; await new Promise((resolve) => setTimeout(resolve, 20)); }
  throw new Error("Timed out waiting for extension state");
}
