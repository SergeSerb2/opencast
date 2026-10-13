#!/usr/bin/env node
/**
 * Screenshot Surgecast pages at the launcher's native size (750×475 @2x) with
 * the mock backend, to compare against reference screenshots.
 *
 *   node scripts/screenshot.mjs                 # every scene
 *   node scripts/screenshot.mjs root clip       # selected scenes
 *   node scripts/screenshot.mjs --list          # scene names
 *   node scripts/screenshot.mjs --url "gallery.html#form" --out form --size 750x475 [--light]
 *   node scripts/screenshot.mjs --settings --out-dir /tmp/surgecast-re/ours/fe-settings
 *
 * Output: packages/frontend/.screenshots/<name>.png (gitignored).
 * Uses Playwright 1.64 through npx (no local dependency) and a Vite dev server.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "vite";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** @typedef {{ name: string, url: string, size?: [number, number], steps?: Array<{ type?: string, press?: string, wait?: number, click?: string, hover?: string, scroll?: [string, number] }>, fullPage?: boolean }} Scene */

/** Settings pages at the size used to compare with the reference (800×640). */
const settingsScene = (name, route, steps) => {
  const [hash, query] = route.split("?");
  return { name: `settings-${name}`, url: `settings.html${query ? `?${query}` : ""}#${hash}`, size: [800, 640], steps };
};

/** @type {Scene[]} */
const SCENES = [
  { name: "root", url: "main.html" },
  { name: "clip", url: "main.html", steps: [{ type: "clip" }] },
  { name: "window", url: "main.html", steps: [{ type: "window" }] },
  { name: "calculator", url: "main.html", steps: [{ type: "2+2*10 usd in eur" }] },
  { name: "actions", url: "main.html", steps: [{ wait: 150 }, { press: "Meta+k" }, { wait: 350 }] },
  { name: "root-light", url: "main.html?appearance=light" },
  { name: "arguments", url: "main.html", steps: [{ type: "translate" }, { press: "Tab" }, { type: "hello" }] },
  { name: "ext-list", url: "main.html", steps: [{ type: "pull requests" }, { press: "Enter", wait: 700 }] },
  { name: "ext-list-actions", url: "main.html", steps: [{ type: "pull requests" }, { press: "Enter", wait: 700 }, { press: "Meta+k", wait: 350 }] },
  { name: "ext-form", url: "main.html", steps: [{ type: "create issue" }, { press: "Enter", wait: 700 }] },
  { name: "ext-detail", url: "main.html", steps: [{ type: "readme" }, { press: "Enter", wait: 700 }] },
  { name: "ext-grid", url: "main.html", steps: [{ type: "search photos" }, { press: "Enter", wait: 700 }] },
  { name: "preferences", url: "main.html", steps: [{ type: "weather" }, { press: "Enter", wait: 500 }] },
  { name: "script-output", url: "main.html", steps: [{ type: "uptime" }, { press: "Enter", wait: 500 }] },
  { name: "compact", url: "main.html?set.general.windowMode=compact", steps: [{ wait: 300 }] },
  { name: "list", url: "gallery.html#list" },
  { name: "list-actions", url: "gallery.html#list", steps: [{ press: "Meta+k" }, { wait: 350 }] },
  { name: "list-detail", url: "gallery.html#list-detail" },
  { name: "grid", url: "gallery.html#grid" },
  { name: "detail", url: "gallery.html#detail" },
  { name: "form", url: "gallery.html#form" },
  { name: "empty", url: "gallery.html#empty" },
  { name: "toast", url: "gallery.html#toast", steps: [{ wait: 1700 }] },
  { name: "toast-failure", url: "gallery.html#toast-failure", steps: [{ wait: 400 }] },
  { name: "gallery", url: "gallery.html", size: [1500, 1000], fullPage: true },
  settingsScene("general", "general"),
  settingsScene("launcher", "launcher"),
  settingsScene("shortcuts", "shortcuts"),
  settingsScene("keyboard", "keyboard"),
  settingsScene("cloud-sync", "cloud-sync"),
  settingsScene("advanced", "advanced"),
  settingsScene("about", "about"),
  settingsScene("ai", "ai"),
  settingsScene("ai-models", "ai/models"),
  settingsScene("ai-provider", "ai/providers/openai"),
  settingsScene("ai-commands", "ai/commands"),
  settingsScene("ai-presets", "ai/presets"),
  settingsScene("mcp", "mcp"),
  settingsScene("clipboard", "clipboard-history"),
  settingsScene("snippets", "snippets"),
  settingsScene("window-management", "window-management"),
  settingsScene("file-search", "file-search"),
  settingsScene("extension", "extensions/github"),
  ...["applications", "calculator", "calendar", "developer", "emoji", "notes", "quicklinks", "script-commands", "translator", "navigation", "system", "web-searches"].map((route) => settingsScene(route, route)),
  settingsScene("search", "general", [{ click: "[data-settings-search]" }, { type: "api key", wait: 300 }]),
  settingsScene("general-bottom", "general", [{ scroll: [".sc-s-page__scroll .sc-scroll-area__viewport", 2000] }]),
  settingsScene("ai-bottom", "ai", [{ scroll: [".sc-s-page__scroll .sc-scroll-area__viewport", 1200] }]),
  settingsScene("ai-tools", "ai", [{ scroll: [".sc-s-page__scroll .sc-scroll-area__viewport", 2400] }]),
  settingsScene("ai-provider-models", "ai/providers/openai", [{ scroll: [".sc-s-page__scroll .sc-scroll-area__viewport", 900] }]),
  settingsScene("ai-provider-new", "ai/providers/new/cliproxyapi"),
  settingsScene("shortcuts-expanded", "shortcuts", [{ click: ".sc-s-tree__group-toggle >> nth=4" }, { scroll: [".sc-s-page__scroll .sc-scroll-area__viewport", 300] }]),
  settingsScene("cloud-sync-bottom", "cloud-sync", [{ scroll: [".sc-s-page__scroll .sc-scroll-area__viewport", 900] }]),
  settingsScene("hotkey-recorder", "general", [{ click: ".sc-s-hotkey__trigger", wait: 400 }]),
  settingsScene("theme-menu", "general", [{ click: "[aria-label='Dark Theme']", wait: 400 }]),
  settingsScene("add-provider-menu", "ai/models", [{ click: "text=Add Provider", wait: 400 }]),
  settingsScene("light", "general?appearance=light"),
  settingsScene("onboarding", "ai/models?mock.ai.empty=1"),
  settingsScene("cloud-sync-connected", "cloud-sync?set.sync.enabled=true&set.sync.serverUrl=https://sync.example.workers.dev"),
  settingsScene("cloud-sync-devices", "cloud-sync?set.sync.enabled=true&set.sync.serverUrl=https://sync.example.workers.dev", [{ scroll: [".sc-s-page__scroll .sc-scroll-area__viewport", 1000] }]),
  settingsScene("agent-editor", "ai/presets", [{ click: "text=Create Agent", wait: 250 }]),
  settingsScene("command-editor", "ai/commands", [{ click: "text=Create AI Command", wait: 250 }]),
  settingsScene("mcp-editor", "mcp", [{ click: "text=Add Server", wait: 250 }]),
  settingsScene("sync-create-vault", "cloud-sync", [{ click: "[aria-label='Create a New Vault']", wait: 250 }]),
];

function parseArgs(argv) {
  const args = { names: [], url: null, out: null, outDir: null, size: null, light: false, list: false, settings: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") args.url = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--out-dir") args.outDir = argv[++i];
    else if (a === "--size") args.size = argv[++i].split("x").map(Number);
    else if (a === "--light") args.light = true;
    else if (a === "--list") args.list = true;
    else if (a === "--settings") args.settings = true;
    else args.names.push(a);
  }
  return args;
}

/** Find the npx-cached playwright@1.64.0 (its .bin directory is put on PATH by `npm exec`). */
async function loadPlaywright() {
  const path = execFileSync("npm", ["exec", "--yes", "--package=playwright@1.64.0", "--", "node", "-e", "process.stdout.write(process.env.PATH)"], {
    cwd: "/tmp",
    encoding: "utf8",
  });
  const bin = path.split(":").find((entry) => entry.includes("_npx") && entry.endsWith(join("node_modules", ".bin")));
  if (!bin) throw new Error("Could not locate playwright@1.64.0 via npx");
  const pkg = join(dirname(bin), "playwright", "index.mjs");
  if (!existsSync(pkg)) throw new Error(`playwright not found at ${pkg}`);
  return import(pathToFileURL(pkg).href);
}

/** Launch Playwright's Chromium, falling back to the newest headless shell already in the cache. */
async function launchChromium(chromium) {
  try {
    return await chromium.launch();
  } catch (error) {
    const cache = join(homedir(), "Library", "Caches", "ms-playwright");
    const shells = existsSync(cache) ? readdirSync(cache).filter((d) => d.startsWith("chromium_headless_shell-")).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1])) : [];
    for (const dir of shells) {
      const executablePath = join(cache, dir, "chrome-headless-shell-mac-arm64", "chrome-headless-shell");
      if (existsSync(executablePath)) return chromium.launch({ executablePath });
    }
    throw error;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.list) {
    for (const scene of SCENES) console.log(`${scene.name.padEnd(16)} ${scene.url}`);
    return;
  }
  let scenes = SCENES;
  if (args.url) scenes = [{ name: args.out ?? "custom", url: args.url, size: args.size ?? undefined }];
  else if (args.names.length) scenes = SCENES.filter((s) => args.names.includes(s.name));
  else if (args.settings) scenes = SCENES.filter((s) => s.name.startsWith("settings-"));
  if (!scenes.length) throw new Error(`No scenes match: ${args.names.join(", ")}`);

  const outDir = args.outDir ? resolve(args.outDir) : join(root, ".screenshots");
  mkdirSync(outDir, { recursive: true });
  const server = await createServer({ root, configFile: join(root, "vite.config.ts"), logLevel: "error", server: { port: 0, host: "127.0.0.1" } });
  await server.listen();
  const address = server.httpServer.address();
  const base = `http://127.0.0.1:${address.port}/`;
  const { chromium } = await loadPlaywright();
  const browser = await launchChromium(chromium);
  try {
    for (const scene of scenes) {
      const [width, height] = scene.size ?? [750, 475];
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2, colorScheme: args.light ? "light" : "dark" });
      page.on("pageerror", (error) => console.error(`[${scene.name}] page error:`, error.message));
      page.on("console", (msg) => {
        if (msg.type() === "error") console.error(`[${scene.name}] console:`, msg.text());
      });
      const url = new URL(scene.url, base);
      url.searchParams.set("mock", "1");
      await page.goto(url.toString(), { waitUntil: "networkidle" });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(250);
      for (const step of scene.steps ?? []) {
        if (step.type) await page.keyboard.type(step.type, { delay: 15 });
        if (step.press) await page.keyboard.press(step.press);
        if (step.click) await page.click(step.click);
        if (step.hover) await page.hover(step.hover);
        if (step.scroll) await page.$eval(step.scroll[0], (el, top) => el.scrollTo({ top }), step.scroll[1]);
        await page.waitForTimeout(step.wait ?? 200);
      }
      const file = join(outDir, `${scene.name}.png`);
      await page.screenshot({ path: file, fullPage: Boolean(scene.fullPage) });
      console.log(`saved ${file}`);
      await page.close();
    }
  } finally {
    await browser.close();
    await server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
