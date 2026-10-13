import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Note, NoteSummary } from "@surgecast/protocol";
import { NoteSession, type NotesApi } from "../lib/note-session";

/** In-memory backend that, like the real one, stamps `updatedAt` on every write and on `get`. */
function fakeApi() {
  const notes = new Map<string, Note>();
  let clock = 1000;
  let counter = 0;
  const stamp = (note: Note) => {
    note.updatedAt = ++clock;
    return { ...note };
  };
  const api = {
    notes,
    get: vi.fn(async (id: string) => {
      const note = notes.get(id);
      return note ? stamp(note) : null;
    }),
    create: vi.fn(async (content: string) => {
      const note: Note = { id: `n${++counter}`, title: content.split("\n")[0], content, createdAt: clock, updatedAt: clock };
      notes.set(note.id, note);
      return stamp(note);
    }),
    update: vi.fn(async ({ id, content, caret }: { id: string; content?: string; caret?: number }) => {
      const note = notes.get(id);
      if (!note) throw new Error("not found");
      if (content !== undefined) note.content = content;
      if (caret !== undefined) note.caret = caret;
      return stamp(note);
    }),
    list: vi.fn(async () =>
      [...notes.values()].map((note) => ({ id: note.id, title: note.title, preview: "", characters: 0, words: 0, createdAt: note.createdAt, updatedAt: note.updatedAt }) satisfies NoteSummary),
    ),
    /** A change made elsewhere (another device or window). */
    external(id: string, content: string) {
      const note = notes.get(id)!;
      note.content = content;
      stamp(note);
    },
  } satisfies NotesApi & Record<string, unknown>;
  return api;
}

function setup(editing = false) {
  const api = fakeApi();
  const callbacks = { onRemoteContent: vi.fn(), onNoteChange: vi.fn(), onSaveError: vi.fn() };
  const state = { editing };
  const session = new NoteSession(api, callbacks, { debounceMs: 300, isEditing: () => state.editing });
  return { api, callbacks, session, state };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("NoteSession autosave", () => {
  it("debounces edits into one update", async () => {
    const { api, session } = setup();
    const note = await api.create("Hello");
    session.attach(note);
    session.edit("Hello w", 7);
    session.edit("Hello wo", 8);
    session.edit("Hello world", 11);
    expect(api.update).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(api.update).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledWith({ id: note.id, content: "Hello world", caret: 11 });
    expect(session.dirty).toBe(false);
  });

  it("serializes lazily when given a function", async () => {
    const { api, session } = setup();
    session.attach(await api.create("a"));
    const serialize = vi.fn(() => "ab");
    session.edit(serialize, 2);
    session.edit(serialize, 2);
    expect(serialize).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(serialize).toHaveBeenCalledTimes(1);
    expect(api.notes.get("n1")?.content).toBe("ab");
  });

  it("creates a draft on its first non-empty edit, then updates it", async () => {
    const { api, callbacks, session } = setup();
    session.attach(null);
    session.edit("   ", 1);
    await vi.advanceTimersByTimeAsync(300);
    expect(api.create).not.toHaveBeenCalled();
    session.edit("Idea", 4);
    await vi.advanceTimersByTimeAsync(300);
    expect(api.create).toHaveBeenCalledWith("Idea");
    expect(session.noteId).toBe("n1");
    expect(callbacks.onNoteChange).toHaveBeenLastCalledWith(expect.objectContaining({ id: "n1" }));
    session.edit("Idea two", 8);
    await vi.advanceTimersByTimeAsync(300);
    expect(api.create).toHaveBeenCalledTimes(1);
    expect(api.update).toHaveBeenCalledWith({ id: "n1", content: "Idea two", caret: 8 });
  });

  it("keeps typing made while the draft is being created", async () => {
    const { api, session } = setup();
    session.attach(null);
    session.edit("A", 1);
    await vi.advanceTimersByTimeAsync(300);
    session.edit("AB", 2);
    await vi.advanceTimersByTimeAsync(300);
    expect(api.notes.get("n1")?.content).toBe("AB");
  });

  it("saves a moved caret on flush only", async () => {
    const { api, session } = setup();
    session.attach(await api.create("Hello"));
    session.select(3);
    await vi.advanceTimersByTimeAsync(1000);
    expect(api.update).not.toHaveBeenCalled();
    await session.flush();
    expect(api.update).toHaveBeenCalledWith({ id: "n1", caret: 3 });
  });

  it("reports a failed save once and retries on the next edit", async () => {
    const { api, callbacks, session } = setup();
    session.attach(await api.create("x"));
    api.update.mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(new Error("offline"));
    session.edit("xy", 2);
    await vi.advanceTimersByTimeAsync(300);
    session.edit("xyz", 3);
    await vi.advanceTimersByTimeAsync(300);
    expect(callbacks.onSaveError).toHaveBeenCalledTimes(1);
    session.edit("xyz!", 4);
    await vi.advanceTimersByTimeAsync(300);
    expect(api.notes.get("n1")?.content).toBe("xyz!");
  });

  it("drops unsaved edits on discard", async () => {
    const { api, session } = setup();
    session.attach(await api.create("keep"));
    session.edit("changed", 7);
    session.discard();
    await vi.advanceTimersByTimeAsync(300);
    expect(api.update).not.toHaveBeenCalled();
  });
});

describe("NoteSession remote changes", () => {
  it("ignores the echo of its own writes", async () => {
    const { api, callbacks, session } = setup();
    session.attach(await api.create("mine"));
    session.edit("mine!", 5);
    await vi.advanceTimersByTimeAsync(300);
    await session.reconcile();
    expect(api.get).not.toHaveBeenCalled();
    expect(callbacks.onRemoteContent).not.toHaveBeenCalled();
  });

  it("shows content changed elsewhere while idle", async () => {
    const { api, callbacks, session } = setup();
    const note = await api.create("v1");
    session.attach(note);
    api.external(note.id, "v2 from another device");
    await session.reconcile();
    expect(callbacks.onRemoteContent).toHaveBeenCalledWith(expect.objectContaining({ content: "v2 from another device" }));
    expect(session.content).toBe("v2 from another device");
    // The get() that fetched it stamped the note; that echo is recognized as ours.
    callbacks.onRemoteContent.mockClear();
    await session.reconcile();
    expect(callbacks.onRemoteContent).not.toHaveBeenCalled();
  });

  it("waits until editing ends before merging", async () => {
    const { api, callbacks, session, state } = setup(true);
    const note = await api.create("v1");
    session.attach(note);
    api.external(note.id, "remote");
    await session.reconcile();
    expect(api.list).not.toHaveBeenCalled();
    state.editing = false;
    await session.editingEnded();
    expect(callbacks.onRemoteContent).toHaveBeenCalledWith(expect.objectContaining({ content: "remote" }));
  });

  it("lets local edits win over a remote change made before the save", async () => {
    const { api, callbacks, session, state } = setup(true);
    const note = await api.create("v1");
    session.attach(note);
    api.external(note.id, "remote");
    void session.reconcile();
    session.edit("local", 5);
    await vi.advanceTimersByTimeAsync(300);
    state.editing = false;
    await session.editingEnded();
    expect(api.notes.get(note.id)?.content).toBe("local");
    expect(callbacks.onRemoteContent).not.toHaveBeenCalled();
  });
});
