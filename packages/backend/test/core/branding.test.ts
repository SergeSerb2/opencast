import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Database } from "../../src/db/database";
import { databasePath, defaultDataDirectory } from "../../src/util/app-storage";
import { SyncHttp } from "../../src/services/sync/http";
import { fixture } from "./fixture";
import type { CommandPrefs } from "@opencast/protocol";

let f: Awaited<ReturnType<typeof fixture>> | undefined;
afterEach(async () => { await f?.close(); f = undefined; });

describe("OpenCast upgrade compatibility", () => {
  it("opens the existing SQLite database and keeps production and dev data separate", async () => {
    const home = await mkdtemp(join(tmpdir(), "opencast-upgrade-"));
    try {
      const root = join(home, "Library", "Application Support");
      expect(defaultDataDirectory(false, home)).toBe(join(root, "OpenCast"));
      const legacy = join(root, "Surgecast");
      await mkdir(legacy, { recursive: true });
      const old = new Database(join(legacy, "surgecast.db"));
      old.exec("CREATE TABLE saved_notes (content TEXT); INSERT INTO saved_notes VALUES ('Keep this note')");
      old.close();
      const data = defaultDataDirectory(false, home);
      expect(data).toBe(legacy);
      const db = new Database(databasePath(data));
      expect(db.get("SELECT content FROM saved_notes")).toEqual({ content: "Keep this note" });
      db.close();
      expect(defaultDataDirectory(true, home)).toBe(join(root, "OpenCast-Dev"));
      await mkdir(join(root, "Surgecast-Dev"));
      expect(defaultDataDirectory(true, home)).toBe(join(root, "Surgecast-Dev"));
      await writeFile(join(legacy, "opencast.db"), "current");
      expect(databasePath(legacy)).toBe(join(legacy, "opencast.db"));
      await mkdir(join(root, "OpenCast"));
      expect(defaultDataDirectory(false, home)).toBe(join(root, "OpenCast"));
    } finally { await rm(home, { recursive: true, force: true }); }
  });

  it("keeps saved settings, command aliases, and old deep links usable", async () => {
    f = await fixture();
    f.ctx.db.run("INSERT INTO device_settings VALUES (?, ?)", "developer.openSurgecastInDevelopmentMode", "false");
    f.ctx.entities.put("settings", "general.themeDark", { value: "surgecast-midnight" });
    f.ctx.entities.put("commandPrefs", "builtin:core.copySurgecastVersion", { alias: "my-version" });
    expect(f.ctx.settings.get("developer.openOpenCastInDevelopmentMode")).toBe(false);
    expect(f.ctx.settings.getAll()["developer.openOpenCastInDevelopmentMode"]).toBe(false);
    expect(f.ctx.settings.get("general.themeDark")).toBe("opencast-midnight");
    expect(await f.ctx.commands.get("builtin:core.copyOpenCastVersion")).toMatchObject({ alias: "my-version" });
    await f.call("deeplink.open", { url: "surgecast://extensions/surgecast/core/copySurgecastVersion" });
    expect(f.nativeCall).toHaveBeenCalledWith("clipboard.write", { content: { kind: "text", text: "0.1.0" } });
    f.ctx.settings.set("developer.openOpenCastInDevelopmentMode", true);
    expect(f.ctx.settings.getAll()["developer.openOpenCastInDevelopmentMode"]).toBe(true);
    f.ctx.settings.reset("developer.openOpenCastInDevelopmentMode");
    expect(f.ctx.settings.get("developer.openOpenCastInDevelopmentMode")).toBe(true);
  });

  it("sends both device header names to existing self-hosted workers", () => {
    const http = new SyncHttp("http://localhost", "test-token", "mac", new AbortController().signal);
    expect(http.headers()).toMatchObject({ "X-OpenCast-Device": "mac", "X-Surgecast-Device": "mac" });
  });

  it.each(["hotkey", "alias", "favorite", "other-favorite"])("keeps all legacy command fields when editing %s", async edit => {
    f = await fixture();
    const id = "builtin:core.copyOpenCastVersion", oldId = "builtin:core.copySurgecastVersion";
    const original: CommandPrefs = { alias: "version", hotkey: { modifiers: ["cmd"], key: "v" }, enabled: false, favoriteOrder: 3 };
    f.ctx.entities.put("commandPrefs", oldId, original);
    // Recover missing fields even if a partial new record already exists.
    f.ctx.entities.put("commandPrefs", id, { alias: "current-alias" });
    f.ctx.entities.put("commandPrefs", "builtin:core.openSettings", { favoriteOrder: 0 });
    if (edit === "hotkey") await f.call("commands.setPrefs", { id, prefs: { hotkey: { modifiers: ["cmd"], key: "b" } } });
    else if (edit === "alias") await f.call("commands.setPrefs", { id, prefs: { alias: "new-alias" } });
    else await f.call("commands.moveFavorite", { id: edit === "favorite" ? id : "builtin:core.openSettings", toIndex: 0 });
    expect(f.ctx.entities.get<CommandPrefs>("commandPrefs", id)?.data).toEqual({
      ...original, alias: edit === "alias" ? "new-alias" : "current-alias",
      hotkey: edit === "hotkey" ? { modifiers: ["cmd"], key: "b" } : original.hotkey,
      favoriteOrder: edit === "favorite" ? 0 : edit === "other-favorite" ? 1 : 3,
    });
    expect(f.ctx.entities.get("commandPrefs", oldId)).toBeUndefined();
    await f.call("commands.setPrefs", { id, prefs: {}, unset: ["alias", "hotkey", "favoriteOrder"] });
    expect(f.ctx.entities.get("commandPrefs", id)?.data).toEqual({ enabled: false });
    expect(await f.ctx.commands.get(id)).toMatchObject({ alias: undefined, hotkey: undefined, favorite: undefined, enabled: false });
  });
});
