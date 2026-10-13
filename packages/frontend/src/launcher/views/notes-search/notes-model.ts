import type { NoteSummary } from "@opencast/protocol";

/** Search results with title matches moved to the top, keeping the backend's order otherwise. */
export function titleMatchesFirst(notes: NoteSummary[], query: string): NoteSummary[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return notes;
  const inTitle = (note: NoteSummary) => note.title.toLowerCase().includes(needle);
  return [...notes.filter(inTitle), ...notes.filter((note) => !inTitle(note))];
}

/**
 * Content for a duplicate: the first line (the derived title) gets " (Copy)",
 * keeping a leading Markdown heading marker.
 */
export function duplicateNoteContent(content: string): string {
  const newline = content.indexOf("\n");
  const first = newline === -1 ? content : content.slice(0, newline);
  const rest = newline === -1 ? "" : content.slice(newline);
  if (!first.trim()) return `Untitled (Copy)${rest}`;
  return `${first.replace(/\s+$/, "")} (Copy)${rest}`;
}
