import { afterEach, expect, it, vi } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { encodeConfig } from "../../src/services/core/config-format";
import { fixture } from "./fixture";
let f: Awaited<ReturnType<typeof fixture>>;
afterEach(async () => { await f?.close(); });
it("requires native approval for destructive deeplinks", async () => {
  f = await fixture();
  f.nativeCall.mockImplementation(async (method) => method === "alert.show" ? { index: 0 } : undefined);
  const clear = vi.spyOn(f.ctx.rpc, "invoke");
  await f.call("deeplink.open", { url: "surgecast://extensions/surgecast/clipboard-history/clearClipboardHistory" });
  expect(f.nativeCall).toHaveBeenCalledWith("alert.show", expect.objectContaining({ buttons: ["Cancel", "Clear Clipboard History"] }));
  expect(clear.mock.calls.some(([method]) => method === "clipboard.clear")).toBe(false);
  f.nativeCall.mockResolvedValue({ index: 1 });
  await f.call("deeplink.open", { url: "surgecast://extensions/surgecast/clipboard-history/clearClipboardHistory" });
  expect(clear.mock.calls.some(([method]) => method === "clipboard.clear")).toBe(true);
});
it("opening and moving the caret leave the note content revision clean", async () => {
  f = await fixture();
  const note = await f.call("notes.create", { content: "old" });
  const record = f.ctx.entities.get("notes", note.id)!;
  f.ctx.entities.markSynced("notes", note.id, 1, record.updatedAt);
  await f.call("notes.get", { id: note.id });
  await f.call("notes.update", { id: note.id, caret: 1 });
  expect(f.ctx.entities.get("notes", note.id)).toMatchObject({ updatedAt: record.updatedAt, syncDirty: false });
  f.ctx.entities.applyRemote("notes", note.id, { data: { ...note, content: "new" }, createdAt: record.createdAt, updatedAt: record.updatedAt + 1, deleted: false }, 2);
  expect(await f.call("notes.get", { id: note.id })).toMatchObject({ content: "new", caret: 1 });
});
it("defers settings side effects until the import transaction commits", async () => {
  f = await fixture();
  f.emit("clipboard.changed", { changeCount: 1, primary: { kind: "image", base64: Buffer.from("fixture image").toString("base64") }, concealed: false, transient: false, types: [] });
  await vi.waitFor(async () => expect((await f.call("clipboard.list", {})).total).toBe(1));
  const item = (await f.call("clipboard.list", {})).items[0];
  const path = join(f.ctx.dataDir, "rollback.json");
  await writeFile(path, await encodeConfig({ schemaVersion: 1, collections: { settings: [
    { id: "clipboard.keepHistoryFor", data: { value: "never" } },
    { id: "general.appearance", data: { value: "invalid" } },
  ] } }));
  const changed = vi.fn(); f.ctx.settings.onChange(changed);
  const result = await f.call("data.import", { path });
  expect(result.results[0].imported).toBe(0);
  await new Promise(resolve => setImmediate(resolve));
  expect((await f.call("clipboard.list", {})).total).toBe(1);
  expect(await readFile(item.imagePath!)).toEqual(Buffer.from("fixture image"));
  expect(changed).not.toHaveBeenCalled();
});
it.each([false, true])("snippet usage preserves concurrent edits/deletion (%s)", async (deleted) => {
  f = await fixture();
  const snippet = await f.call("snippets.create", { name: "Fixture", text: "{clipboard}" });
  let release!: (value: unknown) => void;
  const pending = new Promise(resolve => { release = resolve; });
  f.nativeCall.mockImplementation(async method => method === "clipboard.read" ? pending : undefined);
  const copy = f.call("snippets.copy", { id: snippet.id });
  if (deleted) await f.call("snippets.delete", { id: snippet.id });
  else await f.call("snippets.update", { id: snippet.id, patch: { text: "edited" } });
  release({ text: "original", primary: { kind: "text", text: "original" } });
  await copy;
  expect(await f.call("snippets.get", { id: snippet.id })).toEqual(deleted ? null : expect.objectContaining({ text: "edited", copyCount: 1 }));
});
it.each([false, true])("quicklink usage preserves concurrent edits/deletion (%s)", async deleted => {
  f = await fixture();
  const link = await f.call("quicklinks.create", { name: "Fixture", link: "https://example.com" });
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  f.nativeCall.mockImplementation(async method => method === "open.url" ? pending : undefined);
  const open = f.call("quicklinks.open", { id: link.id });
  await vi.waitFor(() => expect(f.nativeCall).toHaveBeenCalledWith("open.url", expect.anything()));
  if (deleted) await f.call("quicklinks.delete", { id: link.id });
  else await f.call("quicklinks.update", { id: link.id, patch: { link: "https://edited.example" } });
  release(); await open;
  expect(f.ctx.entities.get("quicklinks", link.id)?.data ?? null).toEqual(deleted ? null : expect.objectContaining({ link: "https://edited.example", openCount: 1 }));
});

it("usage does not republish unchanged native snippet keywords", async () => {
  f = await fixture();
  const snippet = await f.call("snippets.create", { name: "Keyword", text: "hello", keyword: ";hi" });
  f.nativeCall.mockClear();
  await f.nativeInvoke("snippets.resolve", { id: snippet.id });
  expect(f.nativeCall.mock.calls.filter(([method]) => method === "snippets.setKeywords")).toHaveLength(0);
  await f.call("snippets.update", { id: snippet.id, patch: { keyword: ";new" } });
  expect(f.nativeCall).toHaveBeenCalledWith("snippets.setKeywords", expect.objectContaining({ keywords: [{ id: snippet.id, keyword: ";new" }] }));
});
