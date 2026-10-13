import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { ClipboardSnapshot, Note } from "@opencast/protocol";
import { fixture } from "./fixture";
let f: Awaited<ReturnType<typeof fixture>> | undefined;
afterEach(async () => {
  await f?.close();
  f = undefined;
});
describe("registered core services", () => {
  it("supports search, CRUD, favorites, aliases and command prefs over RPC", async () => {
    f = await fixture();
    expect(
      await f.call("calc.evaluate", { expression: "20% of 50" }),
    ).toMatchObject({ result: "10" });
    const snippet = await f.call("snippets.create", {
      name: "Greeting",
      text: 'Hello {argument name="Name" default="World"}',
      keyword: ";hi",
    });
    expect(
      await f.call("snippets.render", { text: snippet.text }),
    ).toMatchObject({ text: "Hello World" });
    expect(
      await f.call("snippets.update", {
        id: snippet.id,
        patch: { text: "Updated" },
      }),
    ).toMatchObject({ text: "Updated" });
    expect((await f.call("snippets.list", { query: "greeting" }))[0].id).toBe(
      snippet.id,
    );
    expect(
      (await f.call("commands.list", {})).some((c) => c.kind === "snippet"),
    ).toBe(false);
    expect(f.nativeCall).toHaveBeenCalledWith(
      "snippets.setKeywords",
      expect.objectContaining({
        keywords: [{ id: snippet.id, keyword: ";hi" }],
      }),
    );
    const link = await f.call("quicklinks.create", {
      name: "My Search",
      link: "https://example.com?q={query}",
    });
    expect(
      await f.call("quicklinks.resolve", { link: link.link, query: "a & b" }),
    ).toMatchObject({ url: "https://example.com?q=a%20%26%20b" });
    const commandId = `quicklink:${link.id}`;
    await f.call("commands.setPrefs", {
      id: commandId,
      prefs: {
        alias: "go",
        favoriteOrder: 0,
        hotkey: { modifiers: ["cmd"], key: "g" },
      },
    });
    expect(f.nativeCall).toHaveBeenCalledWith(
      "hotkeys.register",
      expect.objectContaining({ id: commandId }),
    );
    expect(
      (await f.call("search.root", { query: "go" })).sections[0].items[0].id,
    ).toBe(commandId);
    expect(
      (await f.call("search.root", { query: "" })).sections[0],
    ).toMatchObject({ id: "favorites", items: [{ id: commandId }] });
    await f.call("commands.setPrefs", {
      id: commandId,
      prefs: {},
      unset: ["hotkey"],
    });
    expect(f.nativeCall).toHaveBeenCalledWith("hotkeys.unregister", {
      id: commandId,
    });
    expect(
      await f.call("commands.launch", {
        id: commandId,
        arguments: { query: "hi there" },
      }),
    ).toMatchObject({ kind: "done" });
    expect(f.nativeCall).toHaveBeenCalledWith("open.url", {
      url: "https://example.com/?q=hi%20there",
      app: undefined,
    });
    await f.call("commands.setPrefs", {
      id: commandId,
      prefs: { enabled: false },
    });
    await expect(
      f.call("commands.launch", { id: commandId, arguments: { query: "x" } }),
    ).rejects.toThrow("disabled");
    expect(
      (await f.call("search.root", { query: "go" })).sections
        .flatMap((s) => s.items)
        .some((c) => c.id === commandId),
    ).toBe(false);
    const note = await f.call("notes.create", {
      content: "# Title\nUnique phrase",
    });
    expect((await f.call("notes.list", { query: "unique" }))[0]).toMatchObject({
      id: note.id,
      title: "Title",
    });
    await f.call("notes.update", {
      id: note.id,
      content: "New title\nDifferent body",
    });
    expect(await f.call("notes.list", { query: "unique" })).toEqual([]);
    expect(
      await f.call("notes.export", { id: note.id, format: "markdown" }),
    ).toMatchObject({ fileName: "New title.md" });
    await f.call("notes.delete", { id: note.id });
    expect(await f.call("notes.get", { id: note.id })).toBeNull();
    await f.call("quicklinks.delete", { id: link.id });
    await f.call("snippets.delete", { id: snippet.id });
  });
  it("ingests and deduplicates clipboard events, protects pinned rows and never syncs them", async () => {
    f = await fixture();
    const snapshot: ClipboardSnapshot = {
      changeCount: 1,
      primary: { kind: "text", text: "hello searchable world" },
      concealed: false,
      transient: false,
      types: [],
    };
    f.emit("clipboard.changed", snapshot);
    await vi.waitFor(async () =>
      expect((await f!.call("clipboard.list", {})).total).toBe(1),
    );
    f.emit("clipboard.changed", { ...snapshot, changeCount: 2 });
    await vi.waitFor(async () =>
      expect((await f!.call("clipboard.list", {})).items[0].copyCount).toBe(2),
    );
    const item = (await f.call("clipboard.list", { query: "search" })).items[0];
    expect(item.kind).toBe("text");
    expect(f.ctx.entities.list("clipboard")).toEqual([]);
    await f.call("clipboard.pin", { id: item.id, pinned: true });
    await f.call("clipboard.clear", {});
    expect((await f.call("clipboard.list", {})).total).toBe(1);
    await f.call("clipboard.pasteSequentially", { ids: [item.id] });
    expect(f.nativeCall).toHaveBeenCalledWith("clipboard.setSequentialPaste", {
      contents: [{ kind: "text", text: item.text, html: undefined }],
    });
    f.emit("clipboard.changed", {
      ...snapshot,
      concealed: true,
      primary: { kind: "text", text: "secret" },
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect((await f.call("clipboard.list", {})).total).toBe(1);
    await f.call("clipboard.clear", { includePinned: true });
    expect((await f.call("clipboard.list", {})).total).toBe(0);
  });
  it("keeps search indexes and native keywords current for synced entity changes", async () => {
    f = await fixture();
    const note: Note = {
      id: "remote",
      title: "Remote",
      content: "from another device",
      createdAt: 1,
      updatedAt: 2,
    };
    f.ctx.entities.applyRemote(
      "notes",
      note.id,
      { data: note, createdAt: 1, updatedAt: 2, deleted: false },
      1,
    );
    expect((await f.call("notes.list", { query: "another" }))[0].id).toBe(
      "remote",
    );
    f.ctx.entities.applyRemote(
      "notes",
      note.id,
      { data: {}, createdAt: 1, updatedAt: 3, deleted: true },
      2,
    );
    expect(await f.call("notes.list", { query: "another" })).toEqual([]);
    f.ctx.entities.applyRemote(
      "snippets",
      "remote-snippet",
      {
        data: {
          id: "remote-snippet",
          name: "Synced",
          text: "hi",
          keyword: ";s",
          createdAt: 1,
          updatedAt: 2,
        },
        createdAt: 1,
        updatedAt: 2,
        deleted: false,
      },
      3,
    );
    expect(f.nativeCall).toHaveBeenCalledWith(
      "snippets.setKeywords",
      expect.objectContaining({
        keywords: [{ id: "remote-snippet", keyword: ";s" }],
      }),
    );
  });
  it("launches compatible deeplinks, routes hotkeys and records every successful registry launch", async () => {
    f = await fixture();
    expect(
      await f.call("deeplink.open", {
        url: "raycast://extensions/raycast/snippets/searchSnippets",
      }),
    ).toMatchObject({ kind: "view", view: { id: "snippets.search" } });
    expect(
      (await f.call("search.root", { query: "" })).sections.some(
        (s) => s.id === "suggestions",
      ),
    ).toBe(true);
    await f.call("commands.setPrefs", {
      id: "builtin:snippets.searchSnippets",
      prefs: { hotkey: { key: "s", modifiers: ["cmd", "shift"] } },
    });
    f.emit("hotkey.pressed", { id: "builtin:snippets.searchSnippets" });
    await vi.waitFor(() =>
      expect(f!.nativeCall).toHaveBeenCalledWith("window.show", {
        kind: "main",
        route: "command:builtin:snippets.searchSnippets",
      }),
    );
    f.emit("hotkey.pressed", { id: "opencast.toggle" });
    expect(f.nativeCall).toHaveBeenCalledWith("window.toggle", {
      kind: "main",
    });
    await f.call("commands.resetRanking", {});
    expect(
      (await f.call("search.root", { query: "" })).sections[0],
    ).toMatchObject({
      id: "suggestions",
    });
    await expect(
      f.call("deeplink.open", {
        url: "opencast://extensions/raycast/snippets/searchSnippets?arguments=invalid",
      }),
    ).rejects.toThrow("decode");
    expect(
      await f.call("deeplink.open", { url: "opencast://unknown" }),
    ).toBeNull();
  });
  it("exports encrypted content and imports synthetic JSON formats through RPC", async () => {
    f = await fixture();
    const original = await f.call("notes.create", { content: "Export me" });
    const path = join(f.ctx.dataDir, "test.openconfig");
    await f.call("data.export", {
      path,
      password: "pass",
      categories: ["notes"],
    });
    expect((await readFile(path)).subarray(0, Buffer.byteLength("OPENCFG1\n")).toString()).toBe(
      "OPENCFG1\n",
    );
    await f.call("notes.delete", { id: original.id });
    expect(
      await f.call("data.import", { path, password: "pass" }),
    ).toMatchObject({ results: [{ category: "notes", imported: 1 }] });
    expect(await f.call("notes.get", { id: original.id })).toMatchObject({
      content: "Export me",
    });
    expect(
      await f.call("snippets.import", {
        json: JSON.stringify({
          snippets: [{ title: "Valid", text: "Hi" }, { text: "Missing title" }],
        }),
      }),
    ).toEqual({ imported: 1, skipped: 1 });
    expect(
      await f.call("quicklinks.import", {
        json: JSON.stringify([{ name: "Valid", link: "https://example.com" }]),
      }),
    ).toEqual({ imported: 1, skipped: 0 });
  });
  it("discovers and executes scripts without treating arguments as shell source", async () => {
    f = await fixture();
    await f.call("scripts.directories.add", { path: f.ctx.dataDir });
    const script = await f.call("scripts.create", {
      directory: f.ctx.dataDir,
      title: "Example",
      mode: "compact",
      language: "bash",
    });
    await writeFile(
      script.path,
      '#!/bin/bash\n# @raycast.schemaVersion 1\n# @raycast.title Safe Args\n# @raycast.mode compact\n# @raycast.argument1 {"placeholder":"Value"}\nprintf "%s\\n" "$1"\n',
    );
    await f.call("scripts.reload", undefined);
    expect(
      await f.call("scripts.run", {
        path: script.path,
        arguments: ["$(echo injected); hi"],
      }),
    ).toEqual({
      exitCode: 0,
      output: "$(echo injected); hi",
      lastLine: "$(echo injected); hi",
    });
    await expect(
      f.call("scripts.run", { path: "/unconfigured/script.sh" }),
    ).rejects.toThrow("not found");
    await expect(
      f.call("scripts.create", {
        directory: f.ctx.dataDir,
        title: "Example",
        mode: "compact",
        language: "bash",
      }),
    ).rejects.toThrow();
  });
  it("seeds themes and emoji and validates native layout boundaries", async () => {
    f = await fixture();
    expect((await f.call("themes.list", undefined)).map((t) => t.id)).toContain(
      "opencast-dark",
    );
    await expect(
      f.call("themes.delete", { id: "opencast-dark" }),
    ).rejects.toThrow("Built-in");
    const layout = await f.call("windows.layouts.upsert", {
      name: "Left",
      rect: { x: 0, y: 0, width: 0.5, height: 1 },
    });
    await f.call("windows.layouts.apply", { id: layout.id });
    expect(f.nativeCall).toHaveBeenCalledWith("windows.applyLayout", {
      outerGap: 0,
      rect: layout.rect,
      gap: 0,
    });
    await expect(
      f.call("windows.layouts.upsert", {
        name: "Outside",
        rect: { x: 0.9, y: 0, width: 0.5, height: 1 },
      }),
    ).rejects.toThrow("fit");
    f.ctx.settings.set("emoji.skinTone", 3);
    const emojis = await f.call("emoji.search", { query: "thumbs up" });
    expect(
      emojis.sections.flatMap((s) => s.items).some((e) => e.emoji === "👍🏽"),
    ).toBe(true);
    await f.call("emoji.recordUse", { emoji: "👍🏽" });
    expect((await f.call("emoji.search", {})).sections[0].title).toBe(
      "Frequently Used",
    );
  });
});

describe("edge cases and persistence", () => {
  it("uses disk-cached currency rates while offline and caches fresh rates for 12 hours", async () => {
    f = await fixture();
    await writeFile(
      join(f.ctx.dataDir, "currency-rates.json"),
      JSON.stringify({
        fetchedAt: Date.now() - 86400000,
        rates: { USD: 1, EUR: 0.8 },
      }),
    );
    const fetcher = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue({
        ok: true,
        json: async () => ({ rates: { USD: 1, EUR: 0.9 } }),
      });
    vi.stubGlobal("fetch", fetcher);
    try {
      expect(
        await f.call("calc.evaluate", { expression: "100 EUR in USD" }),
      ).toMatchObject({ result: "$125.00", copyValue: "125.00" });
      expect(
        await f.call("calc.evaluate", { expression: "90 EUR in USD" }),
      ).toMatchObject({ result: "$100.00", copyValue: "100.00" });
      await f.call("calc.evaluate", { expression: "90 EUR in USD" });
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(
        JSON.parse(
          await readFile(join(f.ctx.dataDir, "currency-rates.json"), "utf8"),
        ).rates.EUR,
      ).toBe(0.9);
    } finally {
      vi.unstubAllGlobals();
    }
  });
  it("re-registers the global hotkey and refreshes applications when native reports a change", async () => {
    f = await fixture();
    f.ctx.settings.set("general.globalHotkey", {
      modifiers: ["cmd"],
      key: "space",
    });
    await vi.waitFor(() =>
      expect(f!.nativeCall).toHaveBeenCalledWith("hotkeys.register", {
        id: "opencast.toggle",
        hotkey: { modifiers: ["cmd"], key: "space" },
      }),
    );
    expect(f.nativeCall).not.toHaveBeenCalledWith("hotkeys.unregister", {
      id: "opencast.toggle",
    });
    f.emit("apps.changed", { reason: "installed" });
    await f.call("commands.list", {});
    expect(f.nativeCall).toHaveBeenCalledWith("apps.list", { refresh: true, directories: [], recursive: false });
  });
  it("prunes unpinned historical clipboard images and respects disabled applications", async () => {
    f = await fixture();
    f.ctx.settings.set("clipboard.keepHistoryFor", "unlimited");
    const snapshot: ClipboardSnapshot = {
      changeCount: 1,
      primary: {
        kind: "image",
        base64: Buffer.from("synthetic image").toString("base64"),
      },
      concealed: false,
      transient: false,
      types: [],
    };
    f.emit("clipboard.changed", snapshot);
    await vi.waitFor(async () =>
      expect((await f!.call("clipboard.list", {})).total).toBe(1),
    );
    const item = (await f.call("clipboard.list", {})).items[0];
    const old = { ...item, lastCopiedAt: 0 };
    f.ctx.db.run(
      "UPDATE clipboard_history SET last_copied_at=0,data=? WHERE id=?",
      JSON.stringify(old),
      old.id,
    );
    f.ctx.settings.set("clipboard.keepHistoryFor", "1d");
    await vi.waitFor(async () =>
      expect((await f!.call("clipboard.list", {})).total).toBe(0),
    );
    await expect(readFile(item.imagePath!)).rejects.toThrow();
    f.ctx.settings.set("clipboard.disabledApplications", ["private.app"]);
    f.emit("clipboard.changed", {
      ...snapshot,
      primary: { kind: "text", text: "private" },
      sourceApp: {
        name: "Private",
        path: "/Private.app",
        bundleId: "private.app",
      },
    });
    await new Promise((resolve) => setImmediate(resolve));
    expect((await f.call("clipboard.list", {})).total).toBe(0);
  });
  it("streams script output, cancels a process and rejects missing arguments before returning an execution id", async () => {
    f = await fixture();
    await f.call("scripts.directories.add", { path: f.ctx.dataDir });
    const script = await f.call("scripts.create", {
      directory: f.ctx.dataDir,
      title: "Streaming",
      mode: "fullOutput",
      language: "bash",
    });
    await writeFile(
      script.path,
      '#!/bin/bash\n# @raycast.schemaVersion 1\n# @raycast.title Streaming\n# @raycast.mode fullOutput\n# @raycast.argument1 {"placeholder":"Value"}\necho "$1"\nexec sleep 30\n',
    );
    await f.call("scripts.reload", undefined);
    await expect(
      f.call("scripts.start", { path: script.path }),
    ).rejects.toThrow("Missing script argument");
    const output: string[] = [];
    let completed: unknown;
    f.ctx.events.on("scripts.output", (e) => output.push(e.chunk));
    f.ctx.events.on("scripts.completed", (e) => {
      completed = e;
    });
    const { executionId } = await f.call("scripts.start", {
      path: script.path,
      arguments: ["streamed"],
    });
    await vi.waitFor(() => expect(output.join("")).toBe("streamed\n"));
    await f.call("scripts.cancel", { executionId });
    await vi.waitFor(() =>
      expect(completed).toMatchObject({ executionId, exitCode: -1 }),
    );
  });
});
