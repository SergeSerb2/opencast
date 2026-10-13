import { afterEach, describe, expect, it, vi } from "vitest";
import { readFile, access } from "node:fs/promises";
import { fixture } from "./fixture";
let f: Awaited<ReturnType<typeof fixture>> | undefined;
afterEach(async () => { await f?.close(); f = undefined; });
describe("merged frontend contracts", () => {
  it("edits and duplicates clipboard entries without losing representations or shared images", async () => {
    f = await fixture();
    f.emit("clipboard.changed", { changeCount: 1, types: [], concealed: false, transient: false,
      primary: { kind: "text", text: "original", html: "<b>original</b>" } });
    await vi.waitFor(async () => expect((await f!.call("clipboard.list", {})).total).toBe(1));
    const old = (await f.call("clipboard.list", {})).items[0];
    const edited = await f.call("clipboard.update", { id: old.id, patch: { text: "searchable edit", title: "Renamed" } });
    expect(edited).toMatchObject({ html: old.html, title: "Renamed", characters: 15, words: 2 });
    expect((await f.call("clipboard.list", { query: "searchable" })).items[0].id).toBe(old.id);
    const duplicate = await f.call("clipboard.duplicate", { id: old.id });
    expect(duplicate.id).not.toBe(old.id);
    expect(duplicate.contentHash).toBe(edited.contentHash);
    expect((await f.call("clipboard.list", {})).total).toBe(2);
    f.emit("clipboard.changed", { changeCount: 2, types: [], concealed: false, transient: false,
      primary: { kind: "image", base64: Buffer.from("synthetic image").toString("base64") } });
    await vi.waitFor(async () => expect((await f!.call("clipboard.list", { kind: "image" })).total).toBe(1));
    const image = (await f.call("clipboard.list", { kind: "image" })).items[0];
    const copy = await f.call("clipboard.duplicate", { id: image.id });
    await f.call("clipboard.delete", { id: image.id });
    await expect(access(copy.imagePath!)).resolves.toBeUndefined();
    const changed = vi.fn(); f.ctx.events.on("clipboard.itemsChanged", changed);
    await f.call("clipboard.delete", { id: copy.id });
    expect(changed).toHaveBeenCalledWith({ ids: [copy.id], deleted: true });
    await expect(access(copy.imagePath!)).rejects.toThrow();
  });
  it("keeps backup passphrases exclusively in the secrets service", async () => {
    f = await fixture();
    expect(await f.call("data.backup.hasPassphrase", undefined)).toBe(false);
    await f.call("data.backup.setPassphrase", { passphrase: "synthetic-passphrase" });
    expect(await f.call("data.backup.hasPassphrase", undefined)).toBe(true);
    expect(JSON.stringify(f.ctx.settings.getAll()) + JSON.stringify(f.ctx.entities.dirty())).not.toContain("synthetic-passphrase");
    await f.call("data.backup.setPassphrase", { passphrase: "" });
    expect(await f.call("data.backup.hasPassphrase", undefined)).toBe(false);
  });
  it("preserves snippet icons, argument options and quicklink pins", async () => {
    f = await fixture();
    const snippet = await f.call("snippets.create", { name: "Choice", icon: "star", text: '{argument name="Choice" options="One,Two" default="One"}' });
    expect((await f.call("snippets.list", {})).find(s => s.id === snippet.id)?.icon).toBe("star");
    expect(await f.call("snippets.render", { text: snippet.text })).toMatchObject({ text: "One", arguments: [{ name: "Choice", options: ["One", "Two"] }] });
    const link = await f.call("quicklinks.create", { name: "Pinned", link: "https://example.com", pinned: true });
    expect((await f.call("quicklinks.list", {})).find(l => l.id === link.id)?.pinned).toBe(true);
  });
  it.each(["typescript", "go", "csharp"] as const)("creates %s scripts with requested confirmation and refresh metadata", async language => {
    f = await fixture();
    await f.call("scripts.directories.add", { path: f.ctx.dataDir });
    const script = await f.call("scripts.create", { directory: f.ctx.dataDir, title: language, language, mode: "inline", needsConfirmation: true, refreshTime: "2m" });
    expect(script).toMatchObject({ needsConfirmation: true, refreshTime: "2m", mode: "inline" });
    expect(await readFile(script.path, "utf8")).toContain("@raycast.needsConfirmation true");
    if (language === "typescript") expect(await f.call("scripts.run", { path: script.path })).toMatchObject({ exitCode: 0, output: "Hello" });
    await expect(f.call("scripts.create", { directory: f.ctx.dataDir, title: "invalid", language, mode: "inline", refreshTime: "1s" })).rejects.toThrow("Refresh time");
  });
});
