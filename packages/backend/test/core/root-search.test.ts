import { afterEach, describe, expect, it } from "vitest";
import { fixture } from "./fixture";
import type { CommandInfo } from "@opencast/protocol";
import { realisticCatalog } from "./catalog";
import { emptyRootItems } from "../../src/services/core/root-search";

let f: Awaited<ReturnType<typeof fixture>> | undefined;
afterEach(async () => {
  await f?.close();
  f = undefined;
});

describe("empty root search", () => {
  it("seeds five useful suggestions and keeps Commands and Applications available", async () => {
    f = await fixture();
    const root = await f.call("search.root", { query: "" });
    expect(root.sections.map((s) => s.id)).toEqual([
      "suggestions",
      "commands",
      "applications",
    ]);
    const suggestions = root.sections[0].items;
    expect(suggestions).toHaveLength(5);
    expect(
      suggestions.some((c) => c.id === "builtin:clipboard.clipboardHistory"),
    ).toBe(true);
    expect(suggestions.some((c) => c.id === "app:com.apple.Safari")).toBe(true);
    expect(
      root.sections[1].items.some((c) => c.id === "builtin:calculator.history"),
    ).toBe(true);
    const ids = root.sections.flatMap((s) => s.items.map((c) => c.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("replaces seeds with launches and restores them when ranking is reset", async () => {
    f = await fixture();
    await f.call("commands.launch", { id: "builtin:emoji.searchEmoji" });
    const root = await f.call("search.root", { query: "" });
    expect(root.sections[0].items).toHaveLength(5);
    expect(root.sections[0].items[0].id).toBe("builtin:emoji.searchEmoji");
    await f.call("commands.resetRanking", {});
    expect(
      (await f.call("search.root", { query: "" })).sections[0].items[0].id,
    ).toBe("builtin:clipboard.clipboardHistory");
  });
  it("orders favorites first and excludes favorites, aliases, hotkeys and disabled seeds from Suggestions", async () => {
    f = await fixture();
    await f.call("commands.setPrefs", {
      id: "builtin:clipboard.clipboardHistory",
      prefs: { favoriteOrder: 1 },
    });
    await f.call("commands.setPrefs", {
      id: "builtin:files.searchFiles",
      prefs: { favoriteOrder: 0 },
    });
    await f.call("commands.setPrefs", {
      id: "builtin:snippets.searchSnippets",
      prefs: { alias: "snip" },
    });
    await f.call("commands.setPrefs", {
      id: "builtin:ai.openAiChat",
      prefs: { hotkey: { key: "a", modifiers: ["cmd"] } },
    });
    await f.call("commands.setPrefs", {
      id: "builtin:calculator.history",
      prefs: { enabled: false },
    });
    const root = await f.call("search.root", { query: " " });
    expect(root.sections.map((s) => s.id)).toEqual([
      "favorites",
      "suggestions",
      "commands",
    ]);
    expect(root.sections[0].items.map((c) => c.id)).toEqual([
      "builtin:files.searchFiles",
      "builtin:clipboard.clipboardHistory",
    ]);
    const excluded = [
      "builtin:clipboard.clipboardHistory",
      "builtin:files.searchFiles",
      "builtin:snippets.searchSnippets",
      "builtin:ai.openAiChat",
      "builtin:calculator.history",
    ];
    expect(root.sections[1].items.every((c) => !excluded.includes(c.id))).toBe(
      true,
    );
    expect(
      root.sections
        .slice(1)
        .flatMap((s) => s.items)
        .every((c) => !c.favorite && c.enabled),
    ).toBe(true);
    // Aliases suppress seeds, but a learned launch can still suggest that command.
    await f.call("commands.launch", { id: "builtin:snippets.searchSnippets" });
    expect(
      (await f.call("search.root", { query: "" })).sections[1].items[0].id,
    ).toBe("builtin:snippets.searchSnippets");
  });
  it("lets five used commands fully replace seeds and preserves the catalog when suggestions are hidden", async () => {
    f = await fixture();
    const ids = [
      "builtin:emoji.searchEmoji",
      "builtin:notes.search",
      "builtin:snippets.createSnippet",
      "builtin:quicklinks.createQuicklink",
      "builtin:applications.search",
    ];
    for (const id of ids) await f.call("commands.launch", { id });
    const root = await f.call("search.root", { query: "" });
    expect(new Set(root.sections[0].items.map((c) => c.id))).toEqual(
      new Set(ids),
    );
    f.ctx.settings.set("launcher.showRecentlyUsed", false);
    const hidden = await f.call("search.root", { query: "" });
    expect(hidden.sections.map((s) => s.id)).toEqual([
      "commands",
      "applications",
    ]);
    expect(hidden.sections.flatMap((s) => s.items)).toHaveLength(
      (await f.call("commands.list", {})).length,
    );
  });
  it.each(["clip", "1password", "2fa", "v8", "1", "1234.5"])(
    "does not add a calculator card to %s",
    async (query) => {
      f = await fixture();
      f.ctx.settings.set("launcher.includeFilesInRootSearch", false);
      expect(
        (await f.call("search.root", { query })).calculator,
      ).toBeUndefined();
    },
  );
});

const command = (
  id: string,
  extra: Partial<CommandInfo> = {},
): CommandInfo => ({
  id,
  title: id,
  kind: "extension",
  mode: "view",
  typeLabel: "Command",
  icon: "bolt-16",
  enabled: true,
  ...extra,
});

describe("suggestion limits", () => {
  it("caps new installs at two for five minutes and fills the remaining slots with used items and seeds", () => {
    const now = 1_000_000;
    const commands = [
      ...[1, 2, 3].map((n) =>
        command(`new${n}`, { installedAt: now - n, suggestionPriority: 100 }),
      ),
      command("used"),
      command("seed1", { suggestionPriority: 20 }),
      command("seed2", { suggestionPriority: 10 }),
    ];
    const visits = new Map([["used", { count: 10, lastUsed: now }]]);
    expect(
      emptyRootItems(commands, visits, now).suggestions.map((c) => c.id),
    ).toEqual(["new1", "new2", "used", "seed1", "seed2"]);
    expect(
      emptyRootItems(commands, visits, now + 300_000).suggestions[0].id,
    ).toBe("used");
  });
  it("excludes files, disabled candidates and the launcher itself, including used ones", () => {
    const commands = [
      command("file:/tmp/file", { kind: "file" }),
      command("disabled", { enabled: false }),
      command("app:app.opencast", {
        kind: "app",
        title: "OpenCast",
        suggestionPriority: 100,
      }),
      command("seed", { suggestionPriority: 1 }),
    ];
    const visits = new Map(
      commands.map((c) => [c.id, { count: 10, lastUsed: Date.now() }]),
    );
    expect(
      emptyRootItems(commands, visits).suggestions.map((c) => c.id),
    ).toEqual(["seed"]);
  });
  it("deduplicates provider identities in suggestions and the remaining catalog", () => {
    const seed = command("seed", { suggestionPriority: 1 });
    const ordinary = command("ordinary");
    const root = emptyRootItems([seed, seed, ordinary, ordinary], new Map());
    expect(root.suggestions.map((c) => c.id)).toEqual(["seed"]);
    expect(root.commands.map((c) => c.id)).toEqual(["ordinary"]);
  });
});


describe("ranked root RPC", () => {
  it("ranks a realistic catalog and applies sensitivity without noisy metadata matches", async () => {
    f = await fixture();
    f.ctx.settings.set("launcher.includeFilesInRootSearch", false);
    f.ctx.commands.registerProvider({
      id: "ranking-catalog",
      list: () => realisticCatalog.filter((command) => command.kind === "app" && !["Safari", "Terminal"].includes(command.title)),
      launch: () => ({ kind: "done", closeWindow: true }),
    });
    for (const sensitivity of ["low", "medium", "high"] as const) {
      f.ctx.settings.set("launcher.rootSearchSensitivity", sensitivity);
      const root = await f.call("search.root", { query: "clip" });
      const items = root.sections.flatMap((section) => section.items);
      expect(items[0]).toMatchObject({ title: "Clipboard History", subtitle: "OpenCast" });
      expect(items[1]).toMatchObject({ title: "Clipboard History Settings", subtitle: "OpenCast Settings" });
      expect(items.every((command) => command.kind !== "app")).toBe(true);
    }
    for (const [query, title] of [["snip", "Search Snippets"], ["vs code", "Visual Studio Code"], ["ai", "AI Chat"]]) {
      const root = await f.call("search.root", { query });
      expect(root.sections[0].items[0].title).toBe(title);
    }
  });
  it("keeps settings routes and ids stable after renaming", async () => {
    f = await fixture();
    await f.call("commands.launch", { id: "builtin:settings.openClipboardSettings" });
    expect(f.nativeCall).toHaveBeenCalledWith("window.show", { kind: "settings", route: "clipboard" });
    await f.call("commands.launch", { id: "builtin:settings.openAiSettings" });
    expect(f.nativeCall).toHaveBeenCalledWith("window.show", { kind: "settings", route: "ai" });
  });
});
