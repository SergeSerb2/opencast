import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Run after `pnpm --filter @surgecast/backend build`.
const directory = await mkdtemp(join(tmpdir(), "surgecast-core-e2e-"));
// Fixed, fresh rates make the screenshot regression independent of network/live rates.
await writeFile(
  join(directory, "currency-rates.json"),
  JSON.stringify({
    fetchedAt: Date.now(),
    rates: { USD: 1, EUR: 0.8936 },
  }),
);
const backend = fileURLToPath(new URL("../../dist/index.mjs", import.meta.url));
const child = spawn(
  process.execPath,
  [
    backend,
    "--no-native",
    "--dev",
    "--data-dir",
    directory,
    "--port",
    "0",
    "--token",
    "core-test-token",
  ],
  { stdio: ["ignore", "pipe", "pipe"] },
);
let socket;
try {
  const port = await new Promise((resolve, reject) => {
    let log = "";
    const timeout = setTimeout(
      () => reject(new Error("Backend startup timed out")),
      15000,
    );
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Backend exited with ${code}: ${log}`));
    });
    child.stderr.on("data", (chunk) => {
      log += chunk;
      const match = /SURGECAST_BACKEND_READY (.+)/.exec(log);
      if (match) {
        clearTimeout(timeout);
        resolve(JSON.parse(match[1]).port);
      }
    });
  });
  socket = new WebSocket(`ws://127.0.0.1:${port}/rpc?token=core-test-token`);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let id = 0;
  const pending = new Map();
  socket.addEventListener("message", ({ data }) => {
    const response = JSON.parse(data);
    if (!response.id) return;
    const waiter = pending.get(response.id);
    if (!waiter) return;
    pending.delete(response.id);
    clearTimeout(waiter.timeout);
    response.error
      ? waiter.reject(new Error(response.error.message))
      : waiter.resolve(response.result);
  });
  const rpc = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const requestId = ++id;
      const timeout = setTimeout(() => {
        pending.delete(requestId);
        reject(new Error(`${method} timed out`));
      }, 10000);
      pending.set(requestId, { resolve, reject, timeout });
      socket.send(
        JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params }),
      );
    });
  const info = await rpc("app.info");
  assert.ok(info.methods.includes("search.root"));
  const contract = await readFile(new URL("../../../protocol/src/rpc.ts", import.meta.url), "utf8");
  const start = contract.indexOf("export interface BackendMethods"), end = contract.indexOf("\n}\n", start);
  const methods = [...contract.slice(start, end).matchAll(/^\s+"([a-zA-Z][\w.]+)":/gm)].map(match => match[1]);
  assert.deepEqual(methods.filter(method => !info.methods.includes(method)), [], "All backend contracts register in the bundled process");
  const fresh = await rpc("search.root", { query: "" });
  assert.equal(fresh.sections[0].id, "suggestions");
  assert.equal(fresh.sections[0].items.length, 5);
  assert.equal(fresh.sections[1].id, "commands");
  assert.ok(
    fresh.sections[0].items.some(
      (i) => i.id === "builtin:clipboard.clipboardHistory",
    ),
  );
  const freshIds = fresh.sections.flatMap((s) => s.items.map((i) => i.id));
  assert.equal(new Set(freshIds).size, freshIds.length);
  const conversion = await rpc("calc.evaluate", {
    expression: "2+2*10 usd in eur",
  });
  assert.equal(conversion.result, "€19.66");
  assert.equal(conversion.copyValue, "19.66");
  assert.equal(conversion.resultLabel, "Euro");
  assert.equal(conversion.inputLabel, "Expression");
  assert.equal(conversion.interpreted, "2 + 2 × 10 usd in eur");
  assert.deepEqual(
    (await rpc("search.root", { query: "2+2*10 usd in eur" })).calculator,
    conversion,
  );
  assert.equal(
    (await rpc("calc.evaluate", { expression: "100 usd" })).inputLabel,
    "US Dollar",
  );
  assert.equal(
    (await rpc("calc.evaluate", { expression: "1234.5 usd" })).result,
    "$1,234.50",
  );
  assert.equal(
    (await rpc("search.root", { query: "3*4 km in mi" })).calculator.result,
    "7.45645 Miles",
  );
  for (const query of ["clip", "1password", "2fa", "v8", "1", "1234.5"]) {
    assert.equal(await rpc("calc.evaluate", { expression: query }), null);
    assert.equal((await rpc("search.root", { query })).calculator, undefined);
  }
  await rpc("commands.launch", { id: "builtin:emoji.searchEmoji" });
  const learned = await rpc("search.root", { query: "" });
  assert.equal(learned.sections[0].items.length, 5);
  assert.equal(learned.sections[0].items[0].id, "builtin:emoji.searchEmoji");
  await rpc("commands.setPrefs", {
    id: "builtin:emoji.searchEmoji",
    prefs: { favoriteOrder: 0 },
  });
  const favorite = await rpc("search.root", { query: "" });
  assert.equal(favorite.sections[0].id, "favorites");
  assert.equal(favorite.sections[0].items[0].id, "builtin:emoji.searchEmoji");
  assert.ok(
    favorite.sections
      .slice(1)
      .every((s) => s.items.every((i) => i.id !== "builtin:emoji.searchEmoji")),
  );
  await rpc("commands.setPrefs", {
    id: "builtin:emoji.searchEmoji",
    prefs: {},
    unset: ["favoriteOrder"],
  });
  await rpc("commands.resetRanking");
  assert.equal(
    (await rpc("search.root", { query: "" })).sections[0].items.length,
    5,
  );
  assert.equal(
    (await rpc("calc.evaluate", { expression: "50 + 10%" })).copyValue,
    "55",
  );
  assert.equal(
    (await rpc("search.root", { query: "2 m in cm" })).calculator.result,
    "200 Centimeters",
  );
  const root = await rpc("search.root", { query: "clipboard" });
  assert.ok(
    root.sections.some((s) =>
      s.items.some((i) => i.id === "builtin:clipboard.clipboardHistory"),
    ),
  );
  const snippet = await rpc("snippets.create", {
    name: "E2E Snippet",
    text: '{date format="yyyy-MM-dd"} {argument name="Name" default="World"}',
  });
  assert.equal(
    (await rpc("snippets.get", { id: snippet.id })).name,
    snippet.name,
  );
  assert.match(
    (
      await rpc("snippets.render", {
        text: snippet.text,
        arguments: { Name: "Serge" },
      })
    ).text,
    /^\d{4}-\d{2}-\d{2} Serge$/,
  );
  await rpc("snippets.update", { id: snippet.id, patch: { keyword: ";e2e" } });
  assert.equal((await rpc("snippets.list", { query: "E2E" })).length, 1);
  const link = await rpc("quicklinks.create", {
    name: "E2E Search",
    link: "https://example.com?q={query}",
  });
  await rpc("quicklinks.update", {
    id: link.id,
    patch: { name: "Updated E2E Search" },
  });
  assert.equal(
    (
      await rpc("quicklinks.resolve", {
        link: link.link,
        query: "tea & coffee",
      })
    ).url,
    "https://example.com?q=tea%20%26%20coffee",
  );
  assert.ok(
    (await rpc("search.root", { query: "Updated E2E Search" })).sections
      .flatMap((s) => s.items)
      .some((c) => c.id === `quicklink:${link.id}`),
  );
  const note = await rpc("notes.create", {
    content: "# E2E Note\nA searchable phrase",
  });
  assert.equal(
    (await rpc("notes.list", { query: "searchable" }))[0].id,
    note.id,
  );
  await rpc("notes.update", {
    id: note.id,
    content: "Revised Note\nOther content",
  });
  assert.equal((await rpc("notes.get", { id: note.id })).title, "Revised Note");
  assert.equal((await rpc("notes.recent")).id, note.id);
  assert.equal(
    (await rpc("notes.export", { id: note.id, format: "markdown" })).content,
    "Revised Note\nOther content",
  );
  assert.equal(
    (
      await rpc("deeplink.open", {
        url: "raycast://extensions/raycast/snippets/searchSnippets",
      })
    ).view.id,
    "snippets.search",
  );
  const exportPath = join(directory, "content.surgeconfig");
  await rpc("data.export", {
    path: exportPath,
    password: "test-passphrase",
    categories: ["notes", "snippets", "quicklinks"],
  });
  await rpc("notes.delete", { id: note.id });
  assert.equal(await rpc("notes.get", { id: note.id }), null);
  assert.ok(
    (
      await rpc("data.import", {
        path: exportPath,
        password: "test-passphrase",
      })
    ).results.every((result) => !result.error),
  );
  assert.equal(
    (await rpc("notes.get", { id: note.id })).content,
    "Revised Note\nOther content",
  );
  await rpc("snippets.delete", { id: snippet.id });
  await rpc("quicklinks.delete", { id: link.id });
  await rpc("notes.delete", { id: note.id });
  assert.equal(await rpc("snippets.get", { id: snippet.id }), null);
  assert.equal(
    (await rpc("quicklinks.list", { query: "Updated E2E" })).length,
    0,
  );
  assert.ok((await rpc("data.storage")).databaseBytes > 0);
  const commands = await rpc("commands.list");
  console.log(
    JSON.stringify({
      ok: true,
      rpcCalls: id,
      methods: info.methods.length,
      commands: commands.length,
      currencyResult: conversion.result,
      freshSections: fresh.sections.map((s) => s.id),
      freshSuggestions: fresh.sections[0].items.length,
      verified: [
        "search.root",
        "fresh seeds/favorites/frecency",
        "calculator",
        "mixed conversions/formatting/false positives",
        "snippets CRUD",
        "quicklinks CRUD",
        "notes CRUD/FTS",
        "deeplinks",
        "encrypted export/import",
        "storage",
      ],
    }),
  );
} finally {
  socket?.close();
  child.kill("SIGTERM");
  await new Promise((resolve) => {
    if (child.exitCode !== null) resolve();
    else child.once("exit", resolve);
  });
  await rm(directory, { recursive: true, force: true });
}
