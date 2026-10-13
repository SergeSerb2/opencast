export type ImportErrors = Partial<Record<"file" | "json", string>>;

export type ImportSource = { kind: "file"; path: string } | { kind: "text"; json: string };

/** Rows the backend would import from parsed JSON (a list, `{ commands }`, `{ aiCommands }` or one command). */
function importRows(data: unknown): unknown[] | undefined {
  if (Array.isArray(data)) return data;
  if (!data || typeof data !== "object") return undefined;
  const record = data as Record<string, unknown>;
  const rows = record.commands ?? record.aiCommands ?? (record.name || record.title ? [record] : undefined);
  return Array.isArray(rows) ? rows : undefined;
}

/** A chosen file wins over pasted text. */
export function importSource(files: string[], pasted: string): ImportSource {
  return files[0] ? { kind: "file", path: files[0] } : { kind: "text", json: pasted };
}

/** Problems to show before calling `ai.commands.import` (the backend checks every row). */
export function importErrors(files: string[], pasted: string): ImportErrors {
  if (files[0]) return /\.json$/i.test(files[0]) ? {} : { file: "Choose a .json file" };
  if (!pasted.trim()) return { file: "Choose a file or paste JSON" };
  let data: unknown;
  try {
    data = JSON.parse(pasted);
  } catch {
    return { json: "This isn't valid JSON" };
  }
  const rows = importRows(data);
  if (!rows) return { json: "Expected a list of AI commands or an export file" };
  if (!rows.length) return { json: "There are no AI commands in this JSON" };
  return {};
}

export interface ExportSummary {
  total: number;
  custom: number;
  builtin: number;
  bytes: number;
}

/** Counts for the export sidebar, from `ai.commands.export` JSON. */
export function exportSummary(json: string): ExportSummary {
  const bytes = new TextEncoder().encode(json).length;
  let rows: unknown[] = [];
  try {
    rows = importRows(JSON.parse(json)) ?? [];
  } catch {
    rows = [];
  }
  const builtin = rows.filter((r) => (r as { kind?: string }).kind === "builtin").length;
  return { total: rows.length, custom: rows.length - builtin, builtin, bytes };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
}
