/** Back/forward through opened notes (⌘[ / ⌘]), keeping at most `limit` entries. */
export class NoteHistory {
  private entries: string[] = [];
  private index = -1;

  constructor(private readonly limit = 100) {}

  get canGoBack(): boolean {
    return this.index > 0;
  }

  get canGoForward(): boolean {
    return this.index < this.entries.length - 1;
  }

  /** Record a note opened by the user; drops the forward entries. */
  visit(id: string): void {
    if (this.entries[this.index] === id) return;
    this.entries = [...this.entries.slice(0, this.index + 1), id].slice(-this.limit);
    this.index = this.entries.length - 1;
  }

  back(): string | null {
    if (!this.canGoBack) return null;
    this.index -= 1;
    return this.entries[this.index];
  }

  forward(): string | null {
    if (!this.canGoForward) return null;
    this.index += 1;
    return this.entries[this.index];
  }

  /** Forget a deleted note; the current entry moves to the nearest earlier one. */
  remove(id: string): void {
    const kept: string[] = [];
    let index = -1;
    this.entries.forEach((entry, i) => {
      if (entry !== id && kept[kept.length - 1] !== entry) kept.push(entry);
      if (i <= this.index) index = kept.length - 1;
    });
    this.entries = kept;
    this.index = kept.length ? Math.max(0, index) : -1;
  }
}
