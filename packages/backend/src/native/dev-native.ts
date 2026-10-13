import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readdirSync, readFileSync, statSync, mkdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, basename } from "node:path";
import { EventEmitter } from "node:events";
import {
  RpcErrorCode,
  type AppInfo,
  type NativeMethod,
  type NativeParams,
  type NativeResult,
  type NativeEvents,
} from "@surgecast/protocol";
import type { NativeApi, NativeEventTopic } from "./client";
import { RpcError } from "../util/errors";
import { createLogger } from "../util/log";

const run = promisify(execFile);
const log = createLogger("dev-native");

const APP_DIRS = [
  "/Applications",
  "/Applications/Utilities",
  "/System/Applications",
  "/System/Applications/Utilities",
  join(homedir(), "Applications"),
];

type Impl = { [M in NativeMethod]?: (params: NativeParams<M>) => Promise<NativeResult<M>> | NativeResult<M> };

/**
 * Stand-in for the Swift host when the backend runs without it (browser dev
 * mode, tests). Implements what macOS command-line tools can do; everything
 * else fails with NativeUnavailable.
 */
export class DevNative implements NativeApi {
  readonly available = false;
  private readonly emitter = new EventEmitter();
  private appsCache?: AppInfo[];
  private readonly impl: Impl;

  constructor(private readonly dataDir: string) {
    this.impl = {
      "app.info": () => ({
        version: "0.0.0-dev",
        build: "dev",
        macOSVersion: process.platform === "darwin" ? "dev" : process.platform,
        macOSMajor: 26,
        arch: process.arch,
        bundlePath: "",
        dataDir: this.dataDir,
      }),
      "apps.list": async ({ refresh }: { refresh?: boolean } = {}) => {
        if (!this.appsCache || refresh) this.appsCache = await scanApps();
        return this.appsCache;
      },
      "apps.frontmost": () => null,
      "apps.previous": () => null,
      "apps.running": () => [],
      "open.url": async ({ url, app }) => void (await run("open", app ? ["-a", app, url] : [url])),
      "open.path": async ({ path, app }) => void (await run("open", app ? ["-a", app, path] : [path])),
      "open.showInFinder": async ({ path }) => void (await run("open", ["-R", path])),
      "clipboard.read": async () => {
        const { stdout } = await run("pbpaste", []);
        return { changeCount: 0, primary: { kind: "text", text: stdout }, text: stdout, types: ["public.utf8-plain-text"], concealed: false, transient: false };
      },
      "clipboard.write": async ({ content }) => {
        const text = content.kind === "text" ? content.text : content.kind === "file" ? content.paths.join("\n") : content.kind === "color" ? content.hex : "";
        await new Promise<void>((resolve, reject) => {
          const child = execFile("pbcopy", [], (err) => (err ? reject(err) : resolve()));
          child.stdin?.end(text);
        });
      },
      "clipboard.setMonitoring": () => undefined,
      "input.paste": async ({ content }) => {
        await this.call("clipboard.write", { content });
        log.info("dev: input.paste copied to clipboard (no keystroke in dev mode)");
      },
      "input.selectedText": () => null,
      "input.selectedFinderItems": () => [],
      "hotkeys.register": () => ({ ok: true }),
      "hotkeys.unregister": () => undefined,
      "hotkeys.unregisterAll": () => undefined,
      "snippets.setKeywords": () => undefined,
      "system.appearance": async () => {
        try {
          const { stdout } = await run("defaults", ["read", "-g", "AppleInterfaceStyle"]);
          return stdout.trim() === "Dark" ? "dark" : "light";
        } catch {
          return "light";
        }
      },
      "permissions.status": () => ({
        accessibility: "unknown", screenRecording: "unknown", calendar: "unknown", reminders: "unknown",
        contacts: "unknown", fullDiskAccess: "unknown", automation: "unknown", inputMonitoring: "unknown",
        location: "unknown", microphone: "unknown",
      }),
      "keychain.get": async ({ account }) => {
        try {
          const { stdout } = await run("security", ["find-generic-password", "-s", "app.surgecast.dev", "-a", account, "-w"]);
          return stdout.replace(/\n$/, "");
        } catch {
          return null;
        }
      },
      "keychain.set": async ({ account, value }) =>
        void (await run("security", ["add-generic-password", "-U", "-s", "app.surgecast.dev", "-a", account, "-w", value])),
      "keychain.delete": async ({ account }) => {
        try {
          await run("security", ["delete-generic-password", "-s", "app.surgecast.dev", "-a", account]);
        } catch {
          /* already gone */
        }
      },
      "files.icon": async ({ path, size }) => ({ pngBase64: await iconPng(path, size) }),
      "hud.show": ({ text }) => void log.info(`HUD: ${text}`),
      "confetti.show": () => void log.info("🎉 confetti"),
      "window.show": () => undefined,
      "window.hide": () => undefined,
      "window.setContentHeight": () => undefined,
      "menubar.set": () => undefined,
      "menubar.remove": () => undefined,
      "windows.screens": () => [],
      "system.notification": ({ title, body }) => void log.info(`notification: ${title} ${body ?? ""}`),
    };
  }

  async call<M extends NativeMethod>(method: M, params: NativeParams<M>): Promise<NativeResult<M>> {
    const fn = this.impl[method] as ((p: NativeParams<M>) => Promise<NativeResult<M>> | NativeResult<M>) | undefined;
    if (!fn) throw new RpcError(RpcErrorCode.NativeUnavailable, `Native method "${method}" needs the Surgecast app`);
    return fn(params ?? ({} as NativeParams<M>));
  }

  on<T extends NativeEventTopic>(topic: T, listener: (payload: NativeEvents[T]) => void): () => void {
    this.emitter.on(topic, listener);
    return () => this.emitter.off(topic, listener);
  }

  serve(): void {
    /* no native host to call us */
  }

  notify(): void {
    /* no-op */
  }
}

async function scanApps(): Promise<AppInfo[]> {
  const apps: AppInfo[] = [];
  const seen = new Set<string>();
  const visit = (dir: string, depth: number) => {
    let entries: string[] = [];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = join(dir, name);
      if (name.endsWith(".app")) {
        if (seen.has(full)) continue;
        seen.add(full);
        apps.push(readApp(full));
      } else if (depth > 0 && !name.startsWith(".")) {
        try {
          if (statSync(full).isDirectory()) visit(full, depth - 1);
        } catch {
          /* skip */
        }
      }
    }
  };
  for (const dir of APP_DIRS) visit(dir, 1);
  if (existsSync("/System/Library/CoreServices/Finder.app")) apps.push(readApp("/System/Library/CoreServices/Finder.app"));
  return apps.sort((a, b) => a.name.localeCompare(b.name));
}

function readApp(path: string): AppInfo {
  const plist = join(path, "Contents", "Info.plist");
  let bundleId: string | undefined;
  let version: string | undefined;
  let name = basename(path, ".app");
  try {
    const xml = readFileSync(plist, "utf8");
    bundleId = plistString(xml, "CFBundleIdentifier");
    version = plistString(xml, "CFBundleShortVersionString");
    name = plistString(xml, "CFBundleDisplayName") ?? name;
  } catch {
    /* binary plist or unreadable: keep folder name */
  }
  return { name, bundleId, path, version, isSystem: path.startsWith("/System/") };
}

function plistString(xml: string, key: string): string | undefined {
  const m = xml.match(new RegExp(`<key>${key}</key>\\s*<string>([^<]*)</string>`));
  return m?.[1];
}

async function iconPng(path: string, size: number): Promise<string> {
  const cacheDir = join(tmpdir(), "surgecast-dev-icons");
  mkdirSync(cacheDir, { recursive: true });
  let icns: string | undefined;
  if (path.endsWith(".app")) {
    try {
      const xml = readFileSync(join(path, "Contents", "Info.plist"), "utf8");
      let file = plistString(xml, "CFBundleIconFile");
      if (file && !file.endsWith(".icns")) file += ".icns";
      if (file) icns = join(path, "Contents", "Resources", file);
    } catch {
      /* ignore */
    }
  }
  if (!icns || !existsSync(icns)) throw new RpcError(RpcErrorCode.NotFound, "icon not available in dev mode");
  const out = join(cacheDir, `${Buffer.from(icns).toString("base64url")}-${size}.png`);
  if (!existsSync(out)) await run("sips", ["-s", "format", "png", "-Z", String(size), icns, "--out", out]);
  return readFileSync(out).toString("base64");
}
