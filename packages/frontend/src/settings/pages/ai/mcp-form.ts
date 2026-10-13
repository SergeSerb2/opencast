import type { MCPServer } from "@surgecast/protocol";

export interface McpDraft {
  id?: string;
  name: string;
  mentionName: string;
  description: string;
  transport: MCPServer["transport"];
  command: string;
  /** One argument per line. */
  args: string;
  /** KEY=value per line. */
  env: string;
  url: string;
  /** Name: value per line. */
  headers: string;
  enabled: boolean;
}

export type McpErrors = Partial<Record<keyof McpDraft, string>>;

/** "@" handle derived from a server name: lowercase words joined by dashes. */
export function mentionNameFor(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function lines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Parse "KEY=value" lines. Returns the map or the first invalid line. */
export function parseEnv(text: string): { values: Record<string, string> } | { error: string } {
  const values: Record<string, string> = {};
  for (const line of lines(text)) {
    const index = line.indexOf("=");
    const key = index === -1 ? "" : line.slice(0, index).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return { error: `“${line}” isn't KEY=value` };
    values[key] = line.slice(index + 1).trim();
  }
  return { values };
}

/** Parse "Name: value" lines. Returns the map or the first invalid line. */
export function parseHeaders(text: string): { values: Record<string, string> } | { error: string } {
  const values: Record<string, string> = {};
  for (const line of lines(text)) {
    const index = line.indexOf(":");
    const name = index === -1 ? "" : line.slice(0, index).trim();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) return { error: `“${line}” isn't Name: value` };
    values[name] = line.slice(index + 1).trim();
  }
  return { values };
}

export function draftFromServer(server: MCPServer | null): McpDraft {
  if (!server) return { name: "", mentionName: "", description: "", transport: "stdio", command: "", args: "", env: "", url: "", headers: "", enabled: true };
  return {
    id: server.id,
    name: server.name,
    mentionName: server.mentionName,
    description: server.description ?? "",
    transport: server.transport,
    command: server.command ?? "",
    args: (server.args ?? []).join("\n"),
    env: Object.entries(server.env ?? {})
      .map(([k, v]) => `${k}=${v}`)
      .join("\n"),
    url: server.url ?? "",
    headers: Object.entries(server.headers ?? {})
      .map(([k, v]) => `${k}: ${v}`)
      .join("\n"),
    enabled: server.enabled,
  };
}

/** Validate a draft and build `ai.mcp.upsert` params, or return field errors. */
export function buildMcpServer(draft: McpDraft): { server: Partial<MCPServer> & { name: string; transport: MCPServer["transport"] } } | { errors: McpErrors } {
  const errors: McpErrors = {};
  const name = draft.name.trim();
  if (!name) errors.name = "Give the server a name";
  const mentionName = mentionNameFor(draft.mentionName || name);
  if (name && !mentionName) errors.mentionName = "Use letters or numbers";
  const base = { ...(draft.id ? { id: draft.id } : {}), name, mentionName, description: draft.description.trim() || undefined, transport: draft.transport, enabled: draft.enabled };
  if (draft.transport === "stdio") {
    if (!draft.command.trim()) errors.command = "Enter the command that starts the server, e.g. npx";
    const env = parseEnv(draft.env);
    if ("error" in env) errors.env = env.error;
    if (Object.keys(errors).length) return { errors };
    return { server: { ...base, command: draft.command.trim(), args: lines(draft.args), env: "values" in env ? env.values : {} } };
  }
  let url: URL | null = null;
  try {
    url = new URL(draft.url.trim());
  } catch {
    errors.url = "Enter the server's URL";
  }
  if (url && url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) errors.url = "Use https:// (http:// only for localhost)";
  if (url && (url.username || url.password)) errors.url = "Put credentials in a header, not the URL";
  const headers = parseHeaders(draft.headers);
  if ("error" in headers) errors.headers = headers.error;
  if (Object.keys(errors).length) return { errors };
  return { server: { ...base, url: draft.url.trim(), headers: "values" in headers ? headers.values : {} } };
}
