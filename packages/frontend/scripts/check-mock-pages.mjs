#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "vite";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const path = execFileSync("npm", ["exec", "--yes", "--package=playwright@1.64.0", "--", "node", "-e", "process.stdout.write(process.env.PATH)"], { cwd: "/tmp", encoding: "utf8" });
const bin = path.split(":").find(entry => entry.includes("_npx") && entry.endsWith(join("node_modules", ".bin")));
if (!bin) throw new Error("Cannot locate cached Playwright");
const { chromium } = await import(pathToFileURL(join(dirname(bin), "playwright/index.mjs")).href);
let browser;
try { browser = await chromium.launch(); }
catch (error) {
  const cache = join(homedir(), "Library/Caches/ms-playwright");
  const shell = readdirSync(cache).filter(name => name.startsWith("chromium_headless_shell-")).sort((a, b) => Number(b.split("-").at(-1)) - Number(a.split("-").at(-1)))[0];
  if (!shell) throw error;
  browser = await chromium.launch({ executablePath: join(cache, shell, "chrome-headless-shell-mac-arm64/chrome-headless-shell") });
}
const server = await createServer({ root, configFile: join(root, "vite.config.ts"), logLevel: "error", server: { port: 0, host: "127.0.0.1" } });
const failures = [];
try {
  await server.listen();
  const address = server.httpServer.address();
  const pages = ["main.html", "ai-chat.html", "notes.html", "settings.html", ...(existsSync(join(root, "gallery.html")) ? ["gallery.html"] : [])];
  for (const name of pages) {
    const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error" || /not implemented|unknown mock|unhandled.*method|method not found/i.test(message.text())) errors.push(message.text()); });
    page.on("requestfailed", request => { if (!request.failure()?.errorText.includes("ERR_ABORTED")) errors.push(`${request.url()}: ${request.failure()?.errorText}`); });
    await page.goto(`http://127.0.0.1:${address.port}/${name}?mock=1`, { waitUntil: "networkidle" });
    await page.waitForTimeout(300);
    if (!await page.locator("#root").innerText()) errors.push("Root rendered no text");
    if (name === "settings.html") {
      for (const route of ["ai/models", "ai/chat", "ai/agents", "ai/commands", "ai/tools", "ai/mcp", "advanced", "clipboard", "snippets", "files", "developer", "cloud-sync"]) {
        await page.goto(`http://127.0.0.1:${address.port}/${name}?mock=1#${route}`, { waitUntil: "networkidle" });
      }
    }
    if (name === "main.html") {
      for (const query of ["clipboard history", "search snippets", "search quicklinks", "translate", "search files", "create script command"]) {
        await page.goto(`http://127.0.0.1:${address.port}/${name}?mock=1`, { waitUntil: "networkidle" });
        const search = page.locator(".sc-launcher-entry[data-active] .sc-search-bar__input").first();
        await search.fill(query);
        await page.waitForTimeout(250);
        await search.press("Enter");
        await page.waitForTimeout(300);
      }
    }
    console.log(`${name}: ${errors.length ? "FAIL" : "PASS"} (${errors.length} errors)`);
    failures.push(...errors.map(error => `${name}: ${error}`));
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
if (failures.length) { console.error(failures.join("\n")); process.exitCode = 1; }
