import type { Note, NoteSummary } from "@surgecast/protocol";
import type { Service } from "../../context";
import {
  list,
  observeCollection,
  requireEntity,
  save,
  stamp,
  ftsQuery,
} from "./shared";

export function noteTitle(content: string): string {
  return (
    content
      .split(/\r?\n/)[0]
      .replace(/^\s*#{1,6}\s+/, "")
      .trim()
      .slice(0, 250) || "Untitled Note"
  );
}
export function summary(note: Note): NoteSummary {
  return {
    id: note.id,
    title: note.title,
    preview: note.content.replace(/\s+/g, " ").slice(0, 200),
    pinned: note.pinned,
    characters: [...note.content].length,
    words: note.content.trim() ? note.content.trim().split(/\s+/u).length : 0,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    lastOpenedAt: note.lastOpenedAt,
  };
}
export const notesService: Service = {
  name: "core.notes",
  register(ctx) {
    ctx.db.addMigrations({
      id: "core-notes-fts-001",
      up: "CREATE VIRTUAL TABLE notes_fts USING fts5(id UNINDEXED, title, content)",
    });
    const index = (id: string) => {
      ctx.db.run("DELETE FROM notes_fts WHERE id=?", id);
      const note = ctx.entities.get<Note>("notes", id)?.data;
      if (note)
        ctx.db.run(
          "INSERT INTO notes_fts VALUES (?,?,?)",
          id,
          note.title,
          note.content,
        );
    };
    ctx.onReady(() => {
      ctx.db.run("DELETE FROM notes_fts");
      for (const note of list<Note>(ctx, "notes")) index(note.id);
    });
    observeCollection(ctx, "notes", (id, deleted) => {
      index(id);
      ctx.events.emit("notes.changed", { id, deleted });
    });
    const withMetadata = (note: Note): Note => ({
      ...note,
      ...(ctx.entities.get<Pick<Note, "lastOpenedAt" | "caret">>("localState", `note:${note.id}`)?.data ?? {}),
    });
    const metadata = (id: string, patch: Pick<Note, "lastOpenedAt" | "caret">) =>
      ctx.entities.put("localState", `note:${id}`, {
        ...(ctx.entities.get("localState", `note:${id}`)?.data ?? {}), ...patch,
      });
    ctx.rpc.handleAll({
      "notes.list": ({ query = "" }) => {
        const match = ftsQuery(query);
        const ids = match
          ? new Set(
              ctx.db
                .all<{
                  id: string;
                }>("SELECT id FROM notes_fts WHERE notes_fts MATCH ?", match)
                .map((r) => r.id),
            )
          : undefined;
        if (query.trim() && !match) return [];
        return list<Note>(ctx, "notes")
          .filter((n) => !ids || ids.has(n.id))
          .sort(
            (a, b) =>
              Number(!!b.pinned) - Number(!!a.pinned) ||
              b.updatedAt - a.updatedAt,
          )
          .map(n => summary(withMetadata(n)));
      },
      "notes.get": ({ id }) => {
        const note = ctx.entities.get<Note>("notes", id)?.data;
        if (!note) return null;
        metadata(id, { lastOpenedAt: Date.now() });
        return withMetadata(requireEntity<Note>(ctx, "notes", id));
      },
      "notes.create": ({ content = "" }) =>
        save(ctx, "notes", {
          ...stamp(),
          content,
          title: noteTitle(content),
          lastOpenedAt: Date.now(),
        }),
      "notes.update": ({ id, content, pinned, caret }) => {
        const old = requireEntity<Note>(ctx, "notes", id);
        if (caret !== undefined) metadata(id, { caret });
        if ((content === undefined || content === old.content) &&
            (pinned === undefined || pinned === old.pinned)) return withMetadata(old);
        return withMetadata(save(ctx, "notes", {
          ...old,
          content: content ?? old.content,
          title: noteTitle(content ?? old.content),
          pinned: pinned ?? old.pinned,
        }));
      },
      "notes.delete": ({ id }) => {
        ctx.entities.delete("notes", id);
        ctx.entities.delete("localState", `note:${id}`);
      },
      "notes.recent": () =>
        list<Note>(ctx, "notes").map(withMetadata).sort(
          (a, b) =>
            (b.lastOpenedAt ?? b.updatedAt) - (a.lastOpenedAt ?? a.updatedAt),
        )[0] ?? null,
      "notes.export": ({ id, format }) => {
        const note = requireEntity<Note>(ctx, "notes", id);
        return {
          content:
            format === "text"
              ? note.content
                  .replace(/^#{1,6}\s+/gm, "")
                  .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
                  .replace(/[*_`]/g, "")
              : note.content,
          fileName: `${note.title.replace(/[/\\:\x00-\x1f]/g, "-")}.${format === "markdown" ? "md" : "txt"}`,
        };
      },
    });
  },
};
