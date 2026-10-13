import { randomBytes } from "node:crypto";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { format } from "node:util";
import type { BackendEvents, BackendMethods } from "@surgecast/protocol";
import { Database } from "./db/database";
import { EntityStore, entitiesMigration } from "./db/entities";
import { EventBus } from "./events";
import { StdioNativeClient, type NativeApi } from "./native/client";
import { DevNative } from "./native/dev-native";
import { RpcRegistry } from "./rpc/registry";
import { WsRpcServer } from "./rpc/ws-server";
import { SettingsService, settingsMigration } from "./services/settings";
import { SecretsService } from "./services/secrets";
import { SERVICES } from "./services";
import { DefaultCommandRegistry } from "./registries/commands";
import { DefaultToolRegistry } from "./registries/tools";
import { DefaultLauncherApi } from "./registries/launcher";
import { unconfiguredAI } from "./registries/ai-unconfigured";
import type { AppContext } from "./context";
import { createLogger, setLogLevel } from "./util/log";

// stdout is the native JSON-RPC channel: never let console.* write to it.
for (const method of ["log", "info", "debug", "warn", "error", "trace"] as const) {
  console[method] = (...args: unknown[]) => process.stderr.write(format(...args) + "\n");
}

const VERSION = process.env.SURGECAST_VERSION ?? "0.1.0";
const log = createLogger("main");

interface Args {
  dataDir: string;
  resourcesDir: string;
  port: number;
  token: string;
  dev: boolean;
  noNative: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const has = (name: string) => argv.includes(`--${name}`);
  const dev = has("dev") || process.env.SURGECAST_DEV === "1";
  return {
    dataDir: resolve(get("data-dir") ?? process.env.SURGECAST_DATA_DIR ?? join(homedir(), "Library", "Application Support", dev ? "Surgecast-Dev" : "Surgecast")),
    resourcesDir: resolve(get("resources") ?? process.env.SURGECAST_RESOURCES ?? join(import.meta.dirname ?? ".", "..")),
    port: Number(get("port") ?? process.env.SURGECAST_PORT ?? 0),
    token: get("token") ?? process.env.SURGECAST_TOKEN ?? randomBytes(24).toString("base64url"),
    dev,
    noNative: has("no-native") || process.env.SURGECAST_NO_NATIVE === "1",
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  if (args.dev) setLogLevel("debug");
  log.info(`Surgecast backend ${VERSION} starting`, { dataDir: args.dataDir, dev: args.dev, native: !args.noNative });

  const native: NativeApi = args.noNative ? new DevNative(args.dataDir) : new StdioNativeClient();
  const db = new Database(join(args.dataDir, "surgecast.db"));
  db.addMigrations(entitiesMigration, settingsMigration);
  const events = new EventBus();
  const entities = new EntityStore(db);
  const settings = new SettingsService(db, entities, events);
  const secrets = new SecretsService(native);
  const rpc = new RpcRegistry<BackendMethods>();
  const server = new WsRpcServer(rpc as never, events, { token: args.token, port: args.port });

  const readyHooks: (() => void | Promise<void>)[] = [];
  const shutdownHooks: (() => void | Promise<void>)[] = [];

  const ctx: AppContext = {
    dataDir: args.dataDir,
    resourcesDir: args.resourcesDir,
    dev: args.dev,
    version: VERSION,
    db,
    entities,
    settings,
    secrets,
    commands: new DefaultCommandRegistry(entities, events),
    ai: unconfiguredAI,
    tools: new DefaultToolRegistry(),
    launcher: new DefaultLauncherApi(events, native),
    native,
    events,
    rpc,
    log: createLogger("svc"),
    registerHttpRoute: (path, route) => server.registerRoute(path, route),
    onReady: (fn) => readyHooks.push(fn),
    onShutdown: (fn) => shutdownHooks.push(fn),
  };

  // Batch entity changes into one "entities.changed" event per collection per tick.
  const pending = new Map<string, { ids: Set<string>; source: "local" | "sync" }>();
  entities.onChange((change) => {
    const key = `${change.collection}|${change.source}`;
    const entry = pending.get(key) ?? { ids: new Set<string>(), source: change.source };
    entry.ids.add(change.id);
    pending.set(key, entry);
    if (pending.size === 1 && entry.ids.size === 1) {
      setImmediate(() => {
        for (const [k, v] of pending) events.emit("entities.changed", { collection: k.split("|")[0], ids: [...v.ids], source: v.source });
        pending.clear();
      });
    }
  });

  rpc.handleAll({
    "app.info": () => ({ version: VERSION, dataDir: args.dataDir, nativeAvailable: native.available, methods: rpc.methods() }),
    "settings.getAll": () => settings.getAll(),
    "settings.set": ({ key, value }) => settings.set(key, value as never),
    "settings.reset": ({ key }) => settings.reset(key),
  });
  native.serve("backend.ping", () => ({ ok: true as const }));

  for (const service of SERVICES) {
    try {
      service.register(ctx);
    } catch (error) {
      log.error(`service ${service.name} failed to register`, error);
    }
  }
  db.migrate();

  const port = await server.listen();
  for (const hook of readyHooks) {
    try {
      await hook();
    } catch (error) {
      log.error("ready hook failed", error);
    }
  }

  const ready = { port, token: args.token, version: VERSION };
  if (native instanceof StdioNativeClient) native.write({ jsonrpc: "2.0", method: "backend.ready", params: ready });
  else process.stderr.write(`SURGECAST_BACKEND_READY ${JSON.stringify(ready)}\n`);
  log.info(`ready on port ${port} with ${rpc.methods().length} methods`);

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`shutting down (${signal})`);
    for (const hook of shutdownHooks.reverse()) {
      try {
        await hook();
      } catch (error) {
        log.error("shutdown hook failed", error);
      }
    }
    await server.close();
    db.close();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => log.error("unhandled rejection", reason));
  process.on("uncaughtException", (error) => log.error("uncaught exception", error));
}

main().catch((error) => {
  log.error("fatal", error);
  process.exit(1);
});
