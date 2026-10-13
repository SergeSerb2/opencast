import { randomUUID } from "node:crypto";
import type { EntityStore } from "../../db/entities";
import type { SyncPayload } from "./crypto";
import { observeTimestamp } from "../../util/ids";

function noteContents(data: unknown): string {
  const value = data as Record<string, unknown> | null;
  if (value && typeof value === "object" && ["content", "text", "rawContent"].some(key => key in value))
    return JSON.stringify([value.content, value.text, value.rawContent]);
  return JSON.stringify(data);
}

/** Preserve an unsent note before LWW replaces it. Run inside the cursor transaction. */
export function applyRemote(entities: EntityStore, remote: SyncPayload, seq: number): "applied" | "stale" {
  observeTimestamp(remote.updatedAt);
  const local = entities.get<Record<string, unknown>>(remote.collection, remote.id, { includeDeleted: true });
  if (remote.collection === "notes" && local?.syncDirty && !local.deleted && remote.updatedAt > local.updatedAt &&
    (remote.deleted || noteContents(local.data) !== noteContents(remote.data))) {
    const id = randomUUID();
    const data = { ...local.data, id, title: `${typeof local.data.title === "string" ? local.data.title : "Untitled"} (Conflicted Copy)` };
    entities.put("notes", id, data);
  }
  return entities.applyRemote(remote.collection, remote.id, remote, seq);
}
