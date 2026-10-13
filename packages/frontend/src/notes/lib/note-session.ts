import type { Note, NoteSummary } from "@surgecast/protocol";

/** The backend calls a session needs (injected so the logic is testable). */
export interface NotesApi {
  get(id: string): Promise<Note | null>;
  create(content: string): Promise<Note>;
  update(params: { id: string; content?: string; caret?: number }): Promise<Note>;
  list(): Promise<NoteSummary[]>;
}

export interface NoteSessionCallbacks {
  /** The open note changed elsewhere and the editor is idle: show `note.content`. */
  onRemoteContent(note: Note): void;
  /** Server state of the open note changed (created, saved, pinned, …). */
  onNoteChange(note: Note | null): void;
  onSaveError(error: unknown): void;
}

export interface NoteSessionOptions {
  debounceMs?: number;
  /** True while the user is typing in the editor; remote merges wait until it is false. */
  isEditing: () => boolean;
}

/**
 * Keeps one open note in sync with the backend: debounced autosave, creation
 * of a draft on its first non-empty edit, caret persistence, and merging of
 * changes made elsewhere (sync, other windows) while the editor is idle.
 *
 * Own writes are told apart from external ones by `updatedAt`: every write
 * (and `notes.get`, which stamps the open time) returns the new timestamp,
 * and `notes.list` reveals whether the stored note moved past it.
 */
export class NoteSession {
  private note: Note | null = null;
  /** Serializes the editor lazily, so typing does not convert the document on every keystroke. */
  private pendingContent: (() => string) | null = null;
  private editorContent = "";
  private savedContent = "";
  private caret = 0;
  private savedCaret = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private saving: Promise<void> | null = null;
  private reconciling: Promise<void> | null = null;
  private reconcileQueued = false;
  private failed = false;
  private readonly debounceMs: number;

  constructor(
    private readonly api: NotesApi,
    private readonly callbacks: NoteSessionCallbacks,
    private readonly options: NoteSessionOptions,
  ) {
    this.debounceMs = options.debounceMs ?? 300;
  }

  /** The open note as last stored, or null for an unsaved draft. */
  get current(): Note | null {
    return this.note;
  }

  get noteId(): string | null {
    return this.note?.id ?? null;
  }

  /** Whether edits are waiting to be written. */
  get dirty(): boolean {
    return this.pendingContent !== null || this.editorContent !== this.savedContent || this.timer !== null || this.saving !== null;
  }

  /** The latest editor content. */
  get content(): string {
    if (this.pendingContent) {
      this.editorContent = this.pendingContent();
      this.pendingContent = null;
    }
    return this.editorContent;
  }

  /** Show `note`, or an empty draft for null. Call `flush()` first to keep the previous note's edits. */
  attach(note: Note | null): void {
    this.cancelTimer();
    this.note = note;
    this.pendingContent = null;
    this.editorContent = this.savedContent = note?.content ?? "";
    this.caret = this.savedCaret = note?.caret ?? 0;
    this.reconcileQueued = false;
    this.failed = false;
  }

  /** Adopt metadata the caller changed directly (e.g. pinning) without touching content. */
  adopt(note: Note): void {
    if (note.id !== this.note?.id) return;
    this.note = { ...note, content: this.savedContent };
  }

  /** The editor content changed; pass a function to defer serializing until the save. */
  edit(content: string | (() => string), caret: number): void {
    this.caret = caret;
    if (typeof content === "function") {
      this.pendingContent = content;
    } else {
      this.pendingContent = null;
      this.editorContent = content;
      if (content === this.savedContent && !this.saving) {
        this.cancelTimer();
        return;
      }
    }
    this.schedule();
  }

  /** The selection moved; persisted with the next save or flush. */
  select(caret: number): void {
    this.caret = caret;
  }

  /** Write pending content (and a moved caret) now. */
  async flush(): Promise<void> {
    this.cancelTimer();
    await this.save(true);
  }

  /** Forget unsaved edits (the note is being deleted). */
  discard(): void {
    this.cancelTimer();
    this.pendingContent = null;
    this.editorContent = this.savedContent;
  }

  /** The user stopped editing (blur, window hidden): save, then merge queued remote changes. */
  async editingEnded(): Promise<void> {
    await this.flush();
    if (this.reconcileQueued) await this.reconcile();
  }

  /** The stored note changed (`notes.changed` / `entities.changed`). */
  async reconcile(): Promise<void> {
    if (!this.note) return;
    if (this.busy()) {
      this.reconcileQueued = true;
      return;
    }
    if (this.reconciling) {
      this.reconcileQueued = true;
      return this.reconciling;
    }
    this.reconcileQueued = false;
    this.reconciling = this.pullRemote().finally(() => {
      this.reconciling = null;
      if (this.reconcileQueued && !this.busy()) void this.reconcile();
    });
    return this.reconciling;
  }

  private busy(): boolean {
    return this.options.isEditing() || this.timer !== null || this.saving !== null;
  }

  private async pullRemote(): Promise<void> {
    const id = this.note?.id;
    if (!id) return;
    const summary = (await this.api.list()).find((entry) => entry.id === id);
    if (!summary || this.note?.id !== id || summary.updatedAt === this.note.updatedAt) return;
    const fresh = await this.api.get(id);
    if (!fresh || this.note?.id !== id) return;
    if (this.busy()) {
      // The user started typing meanwhile; their next save wins.
      this.note = { ...fresh, content: this.savedContent };
      return;
    }
    this.note = fresh;
    const changed = fresh.content !== this.content;
    this.editorContent = this.savedContent = fresh.content;
    this.callbacks.onNoteChange(fresh);
    if (changed) this.callbacks.onRemoteContent(fresh);
  }

  private schedule(): void {
    this.cancelTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.save(false);
    }, this.debounceMs);
  }

  private cancelTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }

  private async save(includeCaret: boolean): Promise<void> {
    while (this.saving) await this.saving;
    const content = this.content;
    const caret = this.caret;
    const note = this.note;
    const contentChanged = content !== this.savedContent;
    const caretChanged = includeCaret && caret !== this.savedCaret && note !== null;
    if (!contentChanged && !caretChanged) return;
    // Drafts become notes on their first non-empty edit; empty drafts are never stored.
    if (!note && !content.trim()) return;
    this.saving = (async () => {
      try {
        const result = note ? await this.api.update({ id: note.id, ...(contentChanged ? { content } : {}), caret }) : await this.api.create(content);
        if (this.note !== note) return; // switched notes while saving
        this.note = result;
        this.savedContent = content;
        this.savedCaret = caret;
        this.failed = false;
        this.callbacks.onNoteChange(result);
      } catch (error) {
        if (!this.failed) this.callbacks.onSaveError(error);
        this.failed = true;
      }
    })();
    try {
      await this.saving;
    } finally {
      this.saving = null;
    }
    if (this.failed) return;
    if (this.pendingContent !== null || this.editorContent !== this.savedContent) this.schedule();
    else if (this.reconcileQueued && !this.busy()) void this.reconcile();
  }
}
