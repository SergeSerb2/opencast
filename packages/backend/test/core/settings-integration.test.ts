import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm, writeFile, readdir, readFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fixture } from "./fixture";
import { ScheduledBackup } from "../../src/services/core/backup";
import { exportData } from "../../src/services/core/data";
import { decodeConfig } from "../../src/services/core/config-format";
import { spotlightQuery } from "../../src/services/core/files";
import { matchesIgnoreFiles } from "../../src/services/core/file-ignores";
let f: Awaited<ReturnType<typeof fixture>> | undefined;
let backup: ScheduledBackup | undefined;
afterEach(async () => { await backup?.stop(); backup = undefined; await f?.close(); f = undefined; vi.unstubAllGlobals(); });
describe("settings runtime integration", () => {
  it("propagates live snippet and clipboard preferences and custom app discovery", async () => {
    f = await fixture();
    f.ctx.settings.set("snippets.expansionMode", "after-delimiter-discarding");
    f.ctx.settings.set("snippets.expandWithinWords", false);
    f.ctx.settings.set("clipboard.recognitionMode", "fast");
    f.ctx.settings.set("clipboard.captureUniversalClipboard", true);
    f.ctx.settings.set("applications.directories", ["~/Custom Apps"]);
    f.ctx.settings.set("applications.recursiveSearch", true);
    await f.call("commands.list", {});
    expect(f.nativeCall).toHaveBeenCalledWith("snippets.setKeywords", expect.objectContaining({ expandWithinWords: false, expansionMode: "after-delimiter-discarding" }));
    expect(f.nativeCall).toHaveBeenCalledWith("clipboard.setMonitoring", expect.objectContaining({ captureUniversalClipboard: true, recognitionMode: "fast" }));
    expect(f.nativeCall).toHaveBeenCalledWith("apps.list", { refresh: true, directories: ["~/Custom Apps"], recursive: true });
    f.ctx.settings.set("windowManagement.outerGap", 12);
    await f.call("windows.run", { command: "leftHalf" });
    expect(f.nativeCall).toHaveBeenCalledWith("windows.run", { command: "leftHalf", gap: 0, outerGap: 12 });
  });
  it("backs up with the Keychain passphrase, respects battery and frequency, and prunes only managed backups", async () => {
    f = await fixture();
    const location = join(f.ctx.dataDir, "backups");
    f.ctx.settings.set("advanced.backupLocation", location);
    f.ctx.settings.set("advanced.backupFrequency", "daily");
    f.ctx.settings.set("advanced.backupAutoDelete", 1);
    backup = new ScheduledBackup(f.ctx, exportData);
    await backup.tick();
    await expect(readdir(location)).rejects.toThrow();
    await f.call("data.backup.setPassphrase", { passphrase: "synthetic-backup-passphrase" });
    f.nativeCall.mockImplementationOnce(async () => true);
    await backup.tick();
    await expect(readdir(location)).rejects.toThrow();
    await backup.tick();
    const first = (await readdir(location))[0];
    const decoded = await decodeConfig(await readFile(join(location, first)), "synthetic-backup-passphrase", true);
    expect(decoded.family).toBe("surge");
    expect(JSON.stringify(decoded.payload)).not.toContain("synthetic-backup-passphrase");
    await writeFile(join(location, "personal.surgeconfig"), "keep");
    await backup.tick();
    expect(await readdir(location)).toHaveLength(2);
    await backup.tick(Date.now() + 86400001);
    expect((await readdir(location)).filter(name => name.startsWith("surgecast-backup-"))).toHaveLength(1);
    expect(await readFile(join(location, "personal.surgeconfig"), "utf8")).toBe("keep");
  });
  it("honors weather opt-out and caches explicit city forecasts", async () => {
    f = await fixture();
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ results: [{ name: "Vancouver", latitude: 49, longitude: -123 }] }))
      .mockResolvedValueOnce(Response.json({ current: { temperature_2m: 14 }, daily: { temperature_2m_min: [10], temperature_2m_max: [16] } }));
    vi.stubGlobal("fetch", fetchMock);
    f.ctx.settings.set("calculator.weather", false);
    expect(await f.call("calc.evaluate", { expression: "weather Vancouver" })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    f.ctx.settings.set("calculator.weather", true);
    expect(await f.call("calc.evaluate", { expression: "weather Vancouver" })).toMatchObject({ result: "14 °C", resultLabel: "10–16 °C today" });
    await f.call("calc.evaluate", { expression: "weather Vancouver" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("uses content predicates and nested ignore files including negations", async () => {
    const root = await mkdtemp(join(tmpdir(), "surgecast-ignore-"));
    try {
      await mkdir(join(root, "nested"));
      await writeFile(join(root, ".gitignore"), "*.txt\n");
      await writeFile(join(root, "nested/.rayignore"), "!keep.txt\n");
      expect(await matchesIgnoreFiles(join(root, "nested/drop.txt"), root)).toBe(true);
      expect(await matchesIgnoreFiles(join(root, "nested/keep.txt"), root)).toBe(false);
      expect(spotlightQuery("hello", true)).toContain("kMDItemTextContent");
      expect(spotlightQuery("hello")).not.toContain("kMDItemTextContent");
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
