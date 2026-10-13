import { describe, expect, it } from "vitest";
import type { BackendEvents, ClipboardItem } from "@surgecast/protocol";
import { Emitter } from "../../../bridge/emitter";
import { createLibraryHandlers } from "../../../bridge/mock/library";
import { loadClipboardItems } from "./operations";

describe("clipboard operations", () => {
  it("loads all pages beyond 1,000 entries, preserving the filters", async () => {
    const entries = Array.from({ length: 1203 }, (_, index) => ({ id: String(index) }) as ClipboardItem);
    const items = await loadClipboardItems(async (params) => {
      expect(params.kind).toBe("text");
      expect(params.query).toBe("hello");
      const offset = params.offset ?? 0;
      return { items: entries.slice(offset, offset + 100), total: entries.length };
    }, { kind: "text", query: "hello" });
    expect(items.map((item) => item.id)).toEqual(entries.map((item) => item.id));
  });

  it("stops if the history shrinks while fetching", async () => {
    let requests = 0;
    const items = await loadClipboardItems(async () => ({ items: requests++ ? [] : [{ id: "one" } as ClipboardItem], total: 2000 }), {});
    expect(items).toHaveLength(1);
    expect(requests).toBe(2);
  });

  it("updates text metadata, duplicates independently and emits changes", async () => {
    const events = new Emitter<BackendEvents>();
    const changes: ClipboardItem[] = [];
    events.on("clipboard.changed", ({ item }) => changes.push(item));
    const handlers = createLibraryHandlers(events);
    const { items } = await handlers["clipboard.list"]!({ kind: "text" });
    const original = items[0];
    const duplicate = await handlers["clipboard.duplicate"]!({ id: original.id });
    const edited = await handlers["clipboard.update"]!({ id: duplicate.id, patch: { title: "Greeting", text: "Hello 👋" } });
    expect(edited).toMatchObject({ title: "Greeting", text: "Hello 👋", characters: 7, words: 2, pinned: false });
    expect((await handlers["clipboard.get"]!({ id: original.id }))?.text).toBe(original.text);
    expect(changes).toHaveLength(2);
    expect(() => handlers["clipboard.update"]!({ id: duplicate.id, patch: { title: " " } })).toThrow(/required/);
  });
});
