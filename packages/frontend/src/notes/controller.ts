import type { Note } from "@surgecast/protocol";
import { createDocument, type Editor, type JSONContent } from "@tiptap/core";
import { EditorState, TextSelection } from "@tiptap/pm/state";
import { backend } from "../bridge/backend";
import { confirmAlert } from "../components/feedback/alert-store";
import { showFailureToast, showToast } from "../components/feedback/toast-store";
import { NoteHistory } from "./lib/history";
import { NoteSession, type NotesApi } from "./lib/note-session";
import type { NotesRoute } from "./lib/routes";
import { countCharacters, countWords, plainTitle, titleFromText } from "./lib/text";
import { useNotesStore } from "./store";

export interface NotesBackend extends NotesApi {
  remove(id: string): Promise<void>;
  setPinned(id: string, pinned: boolean): Promise<Note>;
  recent(): Promise<Note | null>;
}

const backendNotes: NotesBackend = {
  get: (id) => backend.call("notes.get", { id }).then((note) => note ? { ...note } : null),
  create: (content) => backend.call("notes.create", { content }).then((note) => ({ ...note })),
  update: (params) => backend.call("notes.update", params).then((note) => ({ ...note })),
  list: () => backend.call("notes.list", {}),
  remove: (id) => backend.call("notes.delete", { id }).then(() => undefined),
  setPinned: (id, pinned) => backend.call("notes.update", { id, pinned }).then((note) => ({ ...note })),
  recent: () => backend.call("notes.recent").then((note) => note ? { ...note } : null),
};

const EMPTY_DOC: JSONContent = { type: "doc", content: [{ type: "paragraph" }] };

/**
 * Replace the editor's document with `markdown` in a fresh EditorState, so
 * undo history never crosses notes or remote merges, and put the caret at `caret`.
 */
function replaceDocument(editor: Editor, markdown: string, caret: number): void {
  const parsed = editor.markdown?.parse(markdown);
  const json = parsed?.content?.length ? parsed : EMPTY_DOC;
  let doc;
  try {
    doc = createDocument(json, editor.schema);
  } catch {
    doc = createDocument(EMPTY_DOC, editor.schema);
  }
  const position = Math.max(0, Math.min(caret, doc.content.size));
  const selection = TextSelection.near(doc.resolve(position));
  editor.view.updateState(EditorState.create({ doc, selection, plugins: editor.state.plugins }));
}

/**
 * The Notes window's note lifecycle: opening, drafts, autosave through
 * `NoteSession`, history, pinning, duplication and deletion.
 */
export class NotesController {
  readonly session: NoteSession;
  private readonly history = new NoteHistory();
  private editor: Editor | null = null;
  private pending: { markdown: string; caret: number } | null = null;
  private openSequence = 0;
  private readonly deleting = new Set<string>();
  private statsFrame: number | null = null;
  private booted = false;

  constructor(private readonly api: NotesBackend = backendNotes) {
    this.session = new NoteSession(
      api,
      {
        onRemoteContent: (note) => this.showContent(note.content, this.editor?.state.selection.head ?? 0),
        onNoteChange: (note) => {
          // A draft just became a stored note: it joins the back/forward history.
          if (note && !useNotesStore.getState().note) {
            this.history.visit(note.id);
            this.syncHistory();
          }
          useNotesStore.setState({ note });
        },
        onSaveError: (error) => showFailureToast("Could not save note", error),
        onSyncError: (error) => showFailureToast("Could not refresh note", error),
      },
      { isEditing: () => this.isEditing() },
    );
  }

  attachEditor(editor: Editor | null): void {
    this.editor = editor;
    if (editor && this.pending) {
      const { markdown, caret } = this.pending;
      this.pending = null;
      this.showContent(markdown, caret);
    }
  }

  get currentEditor(): Editor | null {
    return this.editor;
  }

  isEditing(): boolean {
    return Boolean(this.editor?.isFocused) && document.hasFocus();
  }

  /** Markdown of the open note including unsaved edits. */
  currentMarkdown(): string {
    return this.editor?.getMarkdown() ?? this.session.content;
  }

  currentTitle(): string {
    return useNotesStore.getState().title;
  }

  focus(position?: "end"): void {
    const editor = this.editor;
    if (!editor) return;
    if (position) editor.commands.focus(position);
    else editor.view.focus();
  }

  // ---- editor events -----------------------------------------------------------

  handleUpdate(): void {
    const editor = this.editor;
    if (!editor) return;
    this.session.edit(() => editor.getMarkdown(), editor.state.selection.head);
    this.scheduleStats();
  }

  handleSelection(): void {
    if (this.editor) this.session.select(this.editor.state.selection.head);
  }

  handleBlur(): void {
    void this.session.editingEnded();
  }

  private scheduleStats(): void {
    if (this.statsFrame !== null) return;
    this.statsFrame = requestAnimationFrame(() => {
      this.statsFrame = null;
      this.refreshStats();
    });
  }

  private refreshStats(): void {
    const editor = this.editor;
    if (!editor) return;
    const { doc } = editor.state;
    const text = editor.getText({ blockSeparator: "\n" });
    const first = doc.firstChild;
    useNotesStore.setState({
      title: titleFromText(first ? doc.textBetween(0, first.nodeSize, "\n", " ") : ""),
      characters: countCharacters(text),
      words: countWords(text),
      empty: editor.isEmpty,
    });
  }

  private showContent(markdown: string, caret: number): void {
    const editor = this.editor;
    if (!editor) {
      this.pending = { markdown, caret };
      return;
    }
    replaceDocument(editor, markdown, caret);
    useNotesStore.setState((state) => ({ docVersion: state.docVersion + 1, linkEditing: false }));
    this.refreshStats();
  }

  private show(note: Note | null, focus: boolean): void {
    this.session.attach(note);
    useNotesStore.setState({ note });
    this.showContent(note?.content ?? "", note?.caret ?? 0);
    if (focus) {
      this.focus();
      requestAnimationFrame(() => this.editor?.commands.scrollIntoView());
    }
  }

  private syncHistory(): void {
    useNotesStore.setState({ canGoBack: this.history.canGoBack, canGoForward: this.history.canGoForward });
  }

  // ---- navigation ----------------------------------------------------------------

  async boot(route: NotesRoute): Promise<void> {
    if (this.booted) return;
    this.booted = true;
    if (route.kind === "open" && (await this.open(route.id))) return;
    if (route.kind === "new") return this.startNew(route.text);
    const sequence = this.openSequence;
    const recent = await this.api.recent().catch(() => null);
    if (sequence !== this.openSequence) return;
    if (recent && (await this.open(recent.id))) return;
    this.show(null, true);
  }

  async route(route: NotesRoute): Promise<void> {
    if (route.kind === "open") await this.open(route.id);
    else if (route.kind === "new") await this.startNew(route.text);
    else this.focus();
  }

  /** Open a note; false when it does not exist or could not be loaded (a newer open taking over counts as success). */
  async open(id: string, options: { recordHistory?: boolean; focus?: boolean } = {}): Promise<boolean> {
    const { recordHistory = true, focus = true } = options;
    const sequence = ++this.openSequence;
    if (id === this.session.noteId) {
      if (focus) this.focus();
      return true;
    }
    if (!(await this.session.flush())) return false;
    if (sequence !== this.openSequence) return true;
    let note: Note | null;
    try {
      note = await this.api.get(id);
    } catch (error) {
      showFailureToast("Could not open note", error);
      return false;
    }
    if (sequence !== this.openSequence) return true;
    if (!note) {
      this.history.remove(id);
      this.syncHistory();
      showToast({ style: "failure", title: "Note not found" });
      return false;
    }
    // The outgoing note remains editable while notes.get is in flight.
    if (!(await this.session.flush())) return false;
    if (sequence !== this.openSequence) return true;
    this.show(note, focus);
    if (recordHistory) this.history.visit(note.id);
    this.syncHistory();
    return true;
  }

  async back(): Promise<void> {
    const id = this.history.back();
    this.syncHistory();
    if (id) await this.open(id, { recordHistory: false });
  }

  async forward(): Promise<void> {
    const id = this.history.forward();
    this.syncHistory();
    if (id) await this.open(id, { recordHistory: false });
  }

  /** New Note (⌘N): an empty draft, reusing an existing blank note instead of piling them up. */
  async newNote(): Promise<void> {
    const sequence = ++this.openSequence;
    if (useNotesStore.getState().empty) {
      this.focus();
      return;
    }
    if (!(await this.session.flush())) return;
    if (sequence !== this.openSequence) return;
    const blank = (await this.api.list().catch(() => [])).find((summary) => summary.characters === 0);
    if (sequence !== this.openSequence) return;
    if (blank && (await this.open(blank.id))) return;
    if (!(await this.session.flush())) return;
    if (sequence !== this.openSequence) return;
    this.show(null, true);
  }

  private async startNew(text?: string): Promise<void> {
    if (!text?.trim()) return this.newNote();
    const sequence = ++this.openSequence;
    if (!(await this.session.flush())) return;
    if (sequence !== this.openSequence) return;
    try {
      const note = await this.api.create(text);
      if (sequence !== this.openSequence) return;
      await this.open(note.id);
    } catch (error) {
      showFailureToast("Could not create note", error);
    }
  }

  // ---- note operations ---------------------------------------------------------------

  async duplicate(id: string | null = this.session.noteId): Promise<void> {
    try {
      let content: string;
      if (!id || id === this.session.noteId) content = this.currentMarkdown();
      else content = (await this.api.get(id))?.content ?? "";
      if (!content.trim()) return;
      if (!(await this.session.flush())) return;
      const copy = await this.api.create(content);
      await this.open(copy.id);
      showToast({ style: "success", title: "Note duplicated" });
    } catch (error) {
      showFailureToast("Could not duplicate note", error);
    }
  }

  async togglePin(id: string | null = this.session.noteId, pinned?: boolean): Promise<void> {
    if (!id) {
      // Pinning a draft stores it first.
      if (!(await this.session.flush())) return;
      id = this.session.noteId;
      if (!id) return;
    }
    const isCurrent = id === this.session.noteId;
    const next = !(pinned ?? (isCurrent ? Boolean(this.session.current?.pinned) : false));
    try {
      const note = await this.api.setPinned(id, next);
      if (isCurrent) {
        this.session.adopt(note);
        useNotesStore.setState({ note: this.session.current });
      }
      showToast({ style: "success", title: next ? "Pinned Note" : "Unpinned Note" });
    } catch (error) {
      showFailureToast(next ? "Could not pin note" : "Could not unpin note", error);
    }
  }

  /** Delete after confirmation (deletion is permanent). */
  async deleteNote(id: string | null = this.session.noteId, title?: string): Promise<void> {
    if (!id) {
      this.show(null, true);
      return;
    }
    const name = title ?? (id === this.session.noteId ? this.currentTitle() : "This note");
    const confirmed = await confirmAlert({
      title: "Delete Note?",
      message: `“${plainTitle(name)}” will be deleted permanently.`,
      primaryAction: { title: "Delete", style: "destructive" },
    });
    if (!confirmed) return;
    const isCurrent = id === this.session.noteId;
    if (isCurrent && !(await this.session.flush())) return;
    this.deleting.add(id);
    try {
      await this.api.remove(id);
    } catch (error) {
      this.deleting.delete(id);
      showFailureToast("Could not delete note", error);
      return;
    }
    this.history.remove(id);
    this.syncHistory();
    if (id === this.session.noteId) {
      this.session.discard();
      await this.openFallback();
    }
    this.deleting.delete(id);
    showToast({ style: "success", title: "Note deleted" });
  }

  async deleteAll(): Promise<void> {
    const confirmed = await confirmAlert({
      title: "Delete All Notes?",
      message: "Every note will be deleted permanently.",
      primaryAction: { title: "Delete", style: "destructive" },
    });
    if (!confirmed) return;
    if (!(await this.session.flush())) return;
    const removed = new Set<string>();
    try {
      const notes = await this.api.list();
      for (const note of notes) this.deleting.add(note.id);
      for (const note of notes) {
        await this.api.remove(note.id);
        removed.add(note.id);
        this.history.remove(note.id);
      }
      this.syncHistory();
      this.session.discard();
      this.show(null, true);
      showToast({ style: "success", title: "All notes deleted" });
    } catch (error) {
      this.syncHistory();
      this.deleting.clear();
      if (this.session.noteId && removed.has(this.session.noteId)) await this.openFallback();
      showFailureToast("Could not delete all notes", error);
    } finally {
      this.deleting.clear();
    }
  }

  private async openFallback(): Promise<void> {
    this.show(null, false);
    const recent = await this.api.recent().catch(() => null);
    if (recent && !this.deleting.has(recent.id) && (await this.open(recent.id))) return;
    this.show(null, true);
  }

  // ---- external changes ----------------------------------------------------------------

  /** `notes.changed`: merge edits made elsewhere into the open note, or react to its deletion. */
  async handleRemoteChange(id: string, deleted: boolean): Promise<void> {
    if (id !== this.session.noteId || this.deleting.has(id)) return;
    if (!deleted) return this.session.reconcile();
    const unsaved = this.session.dirty ? this.currentMarkdown() : null;
    if (unsaved?.trim()) {
      // Deleted elsewhere while edited here: keep the text as a new note.
      this.session.attach(null);
      useNotesStore.setState({ note: null });
      this.session.edit(unsaved, this.editor?.state.selection.head ?? 0);
      if (!(await this.session.flush())) return;
      useNotesStore.setState({ note: this.session.current });
      showToast({ style: "success", title: "Note restored", message: "It was deleted on another device while you were editing." });
      return;
    }
    showToast({ style: "failure", title: "Note was deleted" });
    await this.openFallback();
  }

  /** Sync emits collection changes even when no notes.changed event is sent. */
  async handleCollectionChange(ids: string[]): Promise<void> {
    const id = this.session.noteId;
    if (!id || !ids.includes(id) || this.deleting.has(id)) return;
    const exists = (await this.api.list()).some((note) => note.id === id);
    if (this.session.noteId === id) await this.handleRemoteChange(id, !exists);
  }

  /** The window was hidden or lost focus. */
  async windowDeactivated(): Promise<void> {
    await this.session.editingEnded();
  }

  /** The window became visible or key again. */
  async windowActivated(): Promise<void> {
    if (this.session.dirty && !(await this.session.flush())) return;
    await this.session.reconcile();
  }
}
