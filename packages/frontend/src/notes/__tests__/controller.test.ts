import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Editor } from "@tiptap/core";
import type { Note, NoteSummary } from "@surgecast/protocol";
import { NotesController, type NotesBackend } from "../controller";
import { createNoteExtensions } from "../editor/extensions";
import { useNotesStore } from "../store";
import { autoSizeHeight } from "../hooks/useNotesWindow";

vi.mock("../../components/feedback/alert-store", () => ({ confirmAlert: vi.fn(async () => true), useAlertStore: { getState: () => ({ alert: null }) } }));
vi.mock("../../components/feedback/toast-store", () => ({ showFailureToast: vi.fn(), showToast: vi.fn() }));

const editors: Editor[] = [];

function setup() {
  let clock = 100;
  const notes = new Map<string, Note>(["a", "b"].map((id) => [id, { id, title: id, content: `Note ${id}`, caret: 3, createdAt: 1, updatedAt: ++clock }]));
  const api = {
    get: vi.fn(async (id: string) => notes.has(id) ? { ...notes.get(id)! } : null),
    list: vi.fn(async () => [...notes.values()].map((note): NoteSummary => ({ ...note, preview: note.content, characters: note.content.length, words: 2 }))),
    create: vi.fn(async (content: string) => {
      const note: Note = { id: `copy-${++clock}`, title: content.split("\n")[0]!, content, createdAt: clock, updatedAt: clock };
      notes.set(note.id, note);
      return { ...note };
    }),
    update: vi.fn(async (params: { id: string; content?: string; caret?: number }) => {
      const note = { ...notes.get(params.id)!, ...params, updatedAt: ++clock };
      notes.set(note.id, note);
      return { ...note };
    }),
    setPinned: vi.fn(async (id: string, pinned: boolean) => {
      const note = { ...notes.get(id)!, pinned, updatedAt: ++clock };
      notes.set(id, note);
      return { ...note };
    }),
    remove: vi.fn(async (id: string) => { notes.delete(id); }),
    recent: vi.fn(async () => { const note = [...notes.values()][0]; return note ? { ...note } : null; }),
  } satisfies NotesBackend;
  const controller = new NotesController(api);
  const editor = new Editor({ extensions: createNoteExtensions(), onUpdate: () => controller.handleUpdate(), onSelectionUpdate: () => controller.handleSelection() });
  editors.push(editor);
  controller.attachEditor(editor);
  return { api, notes, controller, editor };
}

beforeEach(() => {
  vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  useNotesStore.setState({ note: null, title: "Untitled", empty: true, characters: 0, words: 0, findOpen: false, panel: null, linkEditing: false, canGoBack: false, canGoForward: false, docVersion: 0 });
});
afterEach(() => {
  while (editors.length) editors.pop()!.destroy();
  vi.unstubAllGlobals();
});

describe("NotesController", () => {
  it("restores the caret and resets undo history when switching notes", async () => {
    const { controller, editor } = setup();
    await controller.open("a", { focus: false });
    expect(editor.state.selection.head).toBe(3);
    editor.commands.insertContent("changed");
    await controller.open("b", { focus: false });
    expect(editor.getText()).toBe("Note b");
    expect(editor.commands.undo()).toBe(false);
  });

  it("keeps unsaved content open when navigation cannot save", async () => {
    const { controller, api, editor } = setup();
    await controller.open("a", { focus: false });
    editor.commands.insertContent("unsaved");
    const text = editor.getText();
    api.update.mockRejectedValueOnce(new Error("offline"));
    expect(await controller.open("b", { focus: false })).toBe(false);
    expect(controller.session.noteId).toBe("a");
    expect(editor.getText()).toBe(text);
    expect(controller.session.dirty).toBe(true);
    await controller.session.flush();
  });

  it("saves edits made to the outgoing note while the next note loads", async () => {
    const { controller, api, notes, editor } = setup();
    await controller.open("a", { focus: false });
    let complete!: (note: Note) => void;
    api.get.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve as (note: Note) => void; }));
    const opening = controller.open("b", { focus: false });
    await vi.waitFor(() => expect(api.get).toHaveBeenCalledWith("b"));
    editor.commands.insertContent("late edit");
    const content = editor.getMarkdown();
    complete(notes.get("b")!);
    await opening;
    expect(notes.get("a")?.content).toBe(content);
    expect(controller.session.noteId).toBe("b");
  });

  it("ignores an older open response after a newer route", async () => {
    const { controller, api, notes } = setup();
    let complete!: (note: Note) => void;
    api.get.mockImplementationOnce(() => new Promise((resolve) => { complete = resolve as (note: Note) => void; }));
    const older = controller.open("a", { focus: false });
    // Let open() reach notes.get after draining pending saves.
    await vi.waitFor(() => expect(api.get).toHaveBeenCalled());
    await controller.open("b", { focus: false });
    complete(notes.get("a")!);
    await older;
    expect(controller.session.noteId).toBe("b");
  });

  it("merges collection-only sync updates and handles deletion", async () => {
    const { controller, notes, editor } = setup();
    await controller.open("a", { focus: false });
    notes.set("a", { ...notes.get("a")!, content: "Synced content", updatedAt: 200 });
    await controller.handleCollectionChange(["a"]);
    expect(editor.getText()).toBe("Synced content");
    notes.delete("a");
    await controller.handleCollectionChange(["a"]);
    expect(controller.session.noteId).toBe("b");
  });

  it("preserves edits as a new note after a remote deletion", async () => {
    const { controller, notes, editor, api } = setup();
    await controller.open("a", { focus: false });
    editor.commands.insertContent("unsaved");
    const content = editor.getMarkdown();
    notes.delete("a");
    await controller.handleCollectionChange(["a"]);
    expect(api.create).toHaveBeenCalledWith(content);
    expect(controller.session.noteId).not.toBe("a");
    expect(editor.getMarkdown()).toBe(content);
  });

  it("keeps current edits after a failed deletion and allows later sync", async () => {
    const { controller, api, notes, editor } = setup();
    await controller.open("a", { focus: false });
    editor.commands.insertContent("local");
    api.remove.mockRejectedValueOnce(new Error("offline"));
    await controller.deleteNote();
    expect(controller.session.noteId).toBe("a");
    notes.set("a", { ...notes.get("a")!, content: "Remote after failure", updatedAt: 200 });
    await controller.handleCollectionChange(["a"]);
    expect(editor.getText()).toBe("Remote after failure");
  });

  it("retries unsaved content when the window or connection returns", async () => {
    const { controller, api, notes, editor } = setup();
    await controller.open("a", { focus: false });
    editor.commands.insertContent("retry");
    api.update.mockRejectedValueOnce(new Error("offline"));
    await controller.session.flush();
    const content = editor.getMarkdown();
    await controller.windowActivated();
    expect(notes.get("a")?.content).toBe(content);
    expect(controller.session.dirty).toBe(false);
  });

  it("does not let an earlier Create route replace a newer open route", async () => {
    const { controller, api } = setup();
    await controller.open("a", { focus: false });
    const create = api.create.getMockImplementation()!;
    let complete!: () => Promise<void>;
    api.create.mockImplementationOnce((content) => new Promise((resolve) => {
      complete = async () => { resolve(await create(content)); };
    }));
    const older = controller.route({ kind: "new", text: "Earlier draft" });
    await vi.waitFor(() => expect(api.create).toHaveBeenCalled());
    await controller.open("b", { focus: false });
    await complete();
    await older;
    expect(controller.session.noteId).toBe("b");
  });
});

describe("window auto-size", () => {
  it("fits measured content once, with bounds and panel accommodation", () => {
    expect(autoSizeHeight(320, 1, false)).toBe(320);
    expect(autoSizeHeight(80, 1, false)).toBe(128);
    expect(autoSizeHeight(1000, 1, false)).toBe(860);
    expect(autoSizeHeight(200, 1, true)).toBe(442);
    expect(autoSizeHeight(100, 1.5, false)).toBe(192);
  });
});
