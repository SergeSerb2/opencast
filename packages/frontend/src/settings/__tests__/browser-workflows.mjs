#!/usr/bin/env node
/** Mock-mode browser acceptance checks. Screenshots stay outside the checkout. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const output = "/tmp/surgecast-re/ours/fe-settings";
mkdirSync(output, { recursive: true });
const npmPath = execFileSync("npm", ["exec", "--yes", "--package=playwright@1.64.0", "--", "node", "-e", "process.stdout.write(process.env.PATH)"], { cwd: "/tmp", encoding: "utf8" });
const bin = npmPath.split(":").find((entry) => entry.includes("_npx") && entry.endsWith("node_modules/.bin"));
const { chromium } = await import(pathToFileURL(join(dirname(bin), "playwright/index.mjs")).href);
let browser;
try { browser = await chromium.launch(); } catch (error) {
  const cache = join(homedir(), "Library/Caches/ms-playwright");
  const candidates = readdirSync(cache).filter((name) => name.startsWith("chromium_headless_shell-")).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  const executablePath = candidates.map((name) => join(cache, name, "chrome-headless-shell-mac-arm64/chrome-headless-shell")).find(existsSync);
  if (!executablePath) throw error;
  browser = await chromium.launch({ executablePath });
}
const server = await createServer({ root, configFile: join(root, "vite.config.ts"), logLevel: "error", server: { host: "127.0.0.1", port: 0 } });
await server.listen();
const base = `http://127.0.0.1:${server.httpServer.address().port}`;
let passed = 0;
const pageErrors = [];
const context = await browser.newContext({ viewport: { width: 800, height: 640 }, deviceScaleFactor: 2, colorScheme: "dark", permissions: ["clipboard-read", "clipboard-write"] });
async function call(page, method, params) {
  return page.evaluate(async ({ method, params }) => {
    const { backend } = await import("/src/bridge/backend.ts");
    return backend.call(method, params);
  }, { method, params });
}
async function route(page, target) {
  await page.evaluate((route) => window.__surgecastNative.emit("window.route", { kind: "settings", route }), target);
  await page.waitForTimeout(100);
}
async function scenario(name, initialRoute, work) {
  const page = await context.newPage();
  page.on("pageerror", (error) => pageErrors.push(`${name}: ${error.message}`));
  try {
    await page.goto(`${base}/settings.html?mock=1#${initialRoute}`, { waitUntil: "networkidle" });
    await work(page);
    passed++;
    console.log(`PASS ${name}`);
  } catch (error) {
    await page.screenshot({ path: join(output, `failed-${name}.png`) });
    throw error;
  } finally { await page.close(); }
}
try {
  await scenario("settings-events-history", "general", async (page) => {
    await page.getByRole("switch", { name: "Open at Login", exact: true }).click();
    assert.equal((await call(page, "settings.getAll"))["general.openAtLogin"], false);
    await call(page, "settings.set", { key: "general.openAtLogin", value: true });
    assert.equal(await page.getByRole("switch", { name: "Open at Login", exact: true }).getAttribute("aria-checked"), "true");
    await route(page, "ai");
    await page.getByRole("heading", { name: "AI", exact: true }).waitFor();
    await page.getByRole("button", { name: "Back", exact: true }).click();
    await page.getByRole("switch", { name: "Open at Login", exact: true }).waitFor();
    await page.getByRole("button", { name: "Forward", exact: true }).click();
    await page.getByRole("heading", { name: "AI", exact: true }).waitFor();
  });
  await scenario("search-row-navigation", "general", async (page) => {
    await page.getByRole("textbox", { name: "Search settings", exact: true }).fill("API key");
    await page.locator(".sc-s-nav-row", { hasText: "Web Search API Key" }).click();
    await page.getByRole("heading", { name: "AI", exact: true }).waitFor();
    await page.getByRole("textbox", { name: "Search settings", exact: true }).fill("recognition mode");
    await page.locator(".sc-s-nav-row", { hasText: "Recognition Mode" }).click();
    await page.locator('[data-setting-id="recognition-mode"]').waitFor();
  });
  await scenario("sidebar-scroll-isolated", "extensions/github", async (page) => {
    const assertFrame = async () => {
      const bounds = await page.evaluate(() => ({
        frameTop: document.querySelector(".sc-dev-window").getBoundingClientRect().top,
        contentTop: document.querySelector(".sc-s-window").getBoundingClientRect().top,
        outerScroll: document.querySelector(".sc-dev-window").scrollTop,
      }));
      assert.equal(bounds.frameTop, bounds.contentTop);
      assert.equal(bounds.outerScroll, 0);
    };
    await assertFrame();
    await route(page, "translator");
    await assertFrame();
    await route(page, "general");
    await assertFrame();
  });
  await scenario("provider-create-and-models", "ai/providers/new/cliproxyapi", async (page) => {
    await page.getByRole("textbox", { name: "Name", exact: true }).fill("Local Proxy");
    await page.getByLabel("API Key", { exact: true }).fill("test-only-key");
    await page.getByRole("button", { name: "Add Header", exact: true }).click();
    await page.getByRole("textbox", { name: "Header name", exact: true }).fill("X-Team");
    await page.getByLabel("Header value", { exact: true }).fill("test-only-value");
    await page.getByRole("button", { name: "Add Provider", exact: true }).click();
    await page.getByText("Saved in Keychain", { exact: true }).first().waitFor();
    const provider = (await call(page, "ai.providers.list")).find((p) => p.name === "Local Proxy");
    assert.equal(provider.hasApiKey, true);
    assert.equal(provider.headers["X-Team"], "$keychain");
    assert.equal(provider.models.length, 3);
    await page.getByRole("switch", { name: "Use claude-sonnet-5-5", exact: true }).click();
    assert.equal((await call(page, "ai.providers.list")).find((p) => p.id === provider.id).models[0].enabled, false);
    await page.getByRole("button", { name: "Model Actions", exact: true }).click();
    await page.getByRole("menuitem", { name: "Add Model…", exact: true }).click();
    const modelEditor = page.getByRole("dialog", { name: "Add Model", exact: true });
    await modelEditor.getByLabel("Model ID", { exact: false }).fill("manual-model");
    await modelEditor.getByLabel("Display Name", { exact: true }).fill("Manual Model");
    await modelEditor.getByLabel("Context Window (tokens)", { exact: true }).fill("32000");
    await modelEditor.getByRole("button", { name: "Add Model", exact: true }).click();
    await page.getByRole("switch", { name: "Use Manual Model", exact: true }).waitFor();
    assert.equal((await call(page, "ai.providers.list")).find((p) => p.id === provider.id).models.find((model) => model.id === "manual-model").contextWindow, 32000);
    await page.screenshot({ path: join(output, "workflow-provider-created.png") });
  });
  await scenario("provider-remove-key", "ai/providers/openai", async (page) => {
    await page.locator('[data-setting-id="api-key"]').getByRole("button", { name: "Remove", exact: true }).click();
    assert.equal(await page.getByRole("button", { name: "Test", exact: true }).isDisabled(), true);
    await page.getByRole("button", { name: "Save Changes", exact: true }).click();
    await page.waitForFunction(async () => {
      const { backend } = await import("/src/bridge/backend.ts");
      return !(await backend.call("ai.providers.list")).find((p) => p.id === "openai").hasApiKey;
    });
  });
  await scenario("agents-create-import-export-reset", "ai/presets", async (page) => {
    await page.getByRole("button", { name: "Create Agent", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Create Agent", exact: true });
    await editor.getByLabel("Name", { exact: true }).fill("Browser Agent");
    await editor.getByLabel("Instructions", { exact: false }).fill("Write concise answers.");
    await editor.getByRole("button", { name: "Create Agent", exact: true }).focus();
    await page.keyboard.press("Tab");
    assert.equal(await editor.getByLabel("Name", { exact: true }).evaluate((element) => element === document.activeElement), true);
    await editor.getByRole("button", { name: "Create Agent", exact: true }).click();
    await page.locator(".sc-s-library-row__main", { hasText: "Browser Agent" }).waitFor();
    await page.getByRole("button", { name: "Import and Export Agents", exact: true }).click();
    await page.getByRole("menuitem", { name: "Import Agents…", exact: true }).click();
    const importer = page.getByRole("dialog", { name: "Import Agents", exact: true });
    await importer.getByLabel("JSON", { exact: true }).fill('[{"name":"Imported Agent","instructions":"Be clear","creativity":"low"}]');
    await importer.getByRole("button", { name: "Import", exact: true }).click();
    await page.locator(".sc-s-library-row__main", { hasText: "Imported Agent" }).waitFor();
    await page.getByRole("button", { name: "Import and Export Agents", exact: true }).click();
    await page.getByRole("menuitem", { name: "Export Agents", exact: true }).click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert.equal(JSON.parse(copied).some((agent) => agent.name === "Imported Agent"), true);
    await call(page, "ai.presets.upsert", { id: "preset-research", name: "Altered Research", instructions: "custom" });
    await page.getByRole("button", { name: "Reset Altered Research", exact: true }).click();
    await page.getByRole("button", { name: "Reset Agent", exact: true }).click();
    await page.locator(".sc-s-library-row__main", { hasText: "Deep Research" }).waitFor();
  });
  await scenario("mcp-secret-and-import", "mcp", async (page) => {
    await page.getByRole("button", { name: "Add Server", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Add MCP Server", exact: true });
    await editor.getByLabel("Name", { exact: true }).fill("Browser Files");
    await editor.getByLabel("Command", { exact: true }).fill("node");
    await editor.getByLabel("Environment Variables", { exact: false }).fill("TOKEN=test-only-secret");
    await editor.getByRole("button", { name: "Add Server", exact: true }).click();
    await page.locator(".sc-s-mcp-row__main", { hasText: "Browser Files" }).waitFor();
    assert.equal((await call(page, "ai.mcp.list")).find((server) => server.name === "Browser Files").env.TOKEN, "$keychain");
    await page.getByRole("button", { name: "Import…", exact: true }).click();
    const importer = page.getByRole("dialog", { name: "Import from Claude Desktop", exact: true });
    await importer.getByLabel("Configuration", { exact: true }).fill('{"mcpServers":null}');
    await importer.getByRole("button", { name: "Import", exact: true }).click();
    await importer.getByText("mcpServers must contain at least one server").waitFor();
    await importer.getByLabel("Configuration", { exact: false }).fill('{"mcpServers":{"browser-http":{"url":"https://example.com/mcp"}}}');
    await importer.getByRole("button", { name: "Import", exact: true }).click();
    await page.locator(".sc-s-mcp-row__main", { hasText: "browser-http" }).waitFor();
  });
  await scenario("ai-command-create-edit-delete", "ai/commands", async (page) => {
    await page.getByRole("button", { name: "Create AI Command", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Create AI Command", exact: true });
    await editor.getByLabel("Name", { exact: true }).fill("Browser Command");
    await editor.getByLabel("Prompt", { exact: false }).fill('Reply with {"summary":{"text":"value"}} for {selection}');
    await editor.getByRole("button", { name: "Create Command", exact: true }).click();
    await page.locator(".sc-s-library-row__main", { hasText: "Browser Command" }).click();
    const edit = page.getByRole("dialog", { name: "Edit AI Command", exact: true });
    await edit.getByLabel("Name", { exact: true }).fill("Edited Browser Command");
    await edit.getByRole("button", { name: "Save", exact: true }).click();
    await page.locator(".sc-s-library-row__main", { hasText: "Edited Browser Command" }).waitFor();
    assert.equal((await call(page, "ai.commands.list")).some((command) => command.name === "Edited Browser Command"), true);
    await page.getByRole("button", { name: "Delete Edited Browser Command", exact: true }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await page.waitForFunction(async () => {
      const { backend } = await import("/src/bridge/backend.ts");
      return !(await backend.call("ai.commands.list")).some((command) => command.name === "Edited Browser Command");
    });
  });
  await scenario("sync-connect-device-category", "cloud-sync", async (page) => {
    await page.locator('[data-setting-id="server-url"] input').fill("https://sync.example.workers.dev");
    await page.locator('[data-setting-id="access-token"] input').fill("test-only-token");
    await page.locator('[data-setting-id="encryption-passphrase"] input').fill("test-only-passphrase");
    await page.getByRole("button", { name: "Connect", exact: true }).click();
    await page.getByText("Up to Date", { exact: true }).waitFor();
    await page.getByRole("switch", { name: "Sync Notes", exact: true }).click();
    assert.equal((await call(page, "settings.getAll"))["sync.disabledCategories"].includes("notes"), true);
    await page.getByRole("button", { name: "Remove Mac Studio", exact: true }).click();
    await page.getByRole("button", { name: "Remove Device", exact: true }).click();
    await page.waitForFunction(async () => {
      const { backend } = await import("/src/bridge/backend.ts");
      return (await backend.call("sync.devices")).length === 1;
    });
    await page.screenshot({ path: join(output, "workflow-sync-connected.png") });
  });
  await scenario("alias-revert-and-hotkey", "shortcuts", async (page) => {
    await page.getByRole("textbox", { name: "Search commands", exact: true }).fill("My Pull Requests");
    const alias = page.getByRole("textbox", { name: "Alias for My Pull Requests", exact: true });
    const previous = await alias.inputValue();
    await alias.fill("discard-this");
    await alias.press("Escape");
    assert.equal((await call(page, "commands.list", { includeDisabled: true })).find((command) => command.title === "My Pull Requests").alias ?? "", previous);
    await alias.fill("prs");
    await alias.press("Tab");
    assert.equal((await call(page, "commands.list", { includeDisabled: true })).find((command) => command.title === "My Pull Requests").alias, "prs");
    await page.getByRole("button", { name: /Hotkey for My Pull Requests:/ }).click();
    await page.keyboard.press("Control+Shift+p");
    await page.getByText("Hotkey saved", { exact: true }).waitFor();
    assert.deepEqual((await call(page, "commands.list", { includeDisabled: true })).find((command) => command.title === "My Pull Requests").hotkey.modifiers, ["ctrl", "shift"]);
  });
  await scenario("rayconfig-import-results", "advanced", async (page) => {
    await page.locator('[data-setting-id="import-from-raycast"]').getByRole("button", { name: "Import…", exact: true }).click();
    const picker = page.getByRole("dialog", { name: "Choose a Raycast Export", exact: true });
    await picker.getByLabel("File Path", { exact: true }).fill("/tmp/settings.rayconfig");
    await picker.getByRole("button", { name: "Import", exact: true }).click();
    const importer = page.getByRole("dialog", { name: "Import from Raycast", exact: true });
    await importer.getByRole("button", { name: "Import", exact: true }).click();
    await importer.getByText("23 imported", { exact: true }).waitFor();
    await page.screenshot({ path: join(output, "workflow-rayconfig-results.png") });
  });
  assert.deepEqual(pageErrors, []);
  console.log(`${passed} browser workflows passed; no page errors`);
} finally {
  await context.close();
  await browser.close();
  await server.close();
}
