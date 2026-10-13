/**
 * Routes the Notes window accepts through the native `window.route` event
 * (`window.show({ kind: "notes", route, payload })`):
 *
 *   "<noteId>" or "note:<noteId>"   open that note (payload `{ id }` / `{ noteId }` works too)
 *   "new" / "create"                start a new note; payload `{ text }` creates it with that text
 *   "" / "show"                     just show the window
 */
export type NotesRoute = { kind: "open"; id: string } | { kind: "new"; text?: string } | { kind: "show" };

function stringField(data: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) if (typeof data[key] === "string") return data[key] as string;
  return undefined;
}

export function parseNotesRoute(route: string | undefined | null, payload?: unknown): NotesRoute {
  const data = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const text = stringField(data, "text", "content");
  const id = stringField(data, "id", "noteId");
  const value = (route ?? "").trim();
  if (value === "new" || value === "create") return { kind: "new", text };
  if (value.startsWith("note:") && value.length > 5) return { kind: "open", id: value.slice(5) };
  if (value && value !== "show" && value !== "root" && !value.includes(":")) return { kind: "open", id: value };
  if (id) return { kind: "open", id };
  if (text !== undefined) return { kind: "new", text };
  return { kind: "show" };
}
