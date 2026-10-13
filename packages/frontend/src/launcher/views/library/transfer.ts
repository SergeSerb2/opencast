/**
 * Import/export file shapes for snippets and quicklinks. Imports accept what
 * OpenCast and Raycast export: an array, `{ snippets | quicklinks: [...] }`,
 * or a single object, with Raycast's field aliases.
 */

export type TransferKind = "snippets" | "quicklinks";

export class ImportFormatError extends Error {
  constructor(message = "The file is not a valid export") {
    super(message);
    this.name = "ImportFormatError";
  }
}

function rowsFrom(value: unknown, kind: TransferKind): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const nested = (value as Record<string, unknown>)[kind];
    if (Array.isArray(nested)) return nested;
    return [value];
  }
  throw new ImportFormatError();
}

function normalizeRow(row: unknown, kind: TransferKind): Record<string, unknown> {
  if (!row || typeof row !== "object" || Array.isArray(row)) throw new ImportFormatError();
  const r = { ...(row as Record<string, unknown>) };
  if (kind === "snippets") {
    if (r.name === undefined && typeof r.title === "string") r.name = r.title;
    if (r.keyword === undefined && typeof r.alias === "string") r.keyword = r.alias;
    if (typeof r.name !== "string" || typeof r.text !== "string") throw new ImportFormatError();
  } else {
    if (r.link === undefined && typeof r.url === "string") r.link = r.url;
    if (r.openWith === undefined) {
      const app = r.applicationId ?? r.applicationID;
      if (typeof app === "string") r.openWith = app;
    }
    if (typeof r.name !== "string" || typeof r.link !== "string") throw new ImportFormatError();
  }
  return r;
}

/**
 * Parse one or more JSON documents into the backend's import payload.
 * Throws ImportFormatError for invalid JSON or rows without the required fields.
 */
export function normalizeImport(documents: string | string[], kind: TransferKind): { json: string; count: number } {
  const rows: Record<string, unknown>[] = [];
  for (const document of Array.isArray(documents) ? documents : [documents]) {
    let value: unknown;
    try {
      value = JSON.parse(document);
    } catch {
      throw new ImportFormatError("The file is not valid JSON");
    }
    for (const row of rowsFrom(value, kind)) rows.push(normalizeRow(row, kind));
  }
  if (!rows.length) throw new ImportFormatError("The file contains no entries");
  return { json: JSON.stringify(rows), count: rows.length };
}

/** "3 snippets" / "1 quicklink". */
export function countLabel(count: number, kind: TransferKind): string {
  const noun = kind === "snippets" ? "snippet" : "quicklink";
  return `${count.toLocaleString()} ${count === 1 ? noun : `${noun}s`}`;
}
