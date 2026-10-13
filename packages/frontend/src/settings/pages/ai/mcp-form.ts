import type { MCPServer } from "@opencast/protocol";

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
  const values: Record<string, string> = Object.create(null);
  for (const line of lines(text)) {
    const index = line.indexOf("=");
    const key = index === -1 ? "" : line.slice(0, index).trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return { error: "Each environment variable must be KEY=value" };
    if (Object.hasOwn(values, key)) return { error: `“${key}” is listed twice` };
    values[key] = line.slice(index + 1).trim();
  }
  return { values };
}

/** Parse "Name: value" lines. Returns the map or the first invalid line. */
export function parseHeaders(text: string): { values: Record<string, string> } | { error: string } {
  const values: Record<string, string> = Object.create(null);
  const names = new Set<string>();
  for (const line of lines(text)) {
    const index = line.indexOf(":");
    const name = index === -1 ? "" : line.slice(0, index).trim();
    if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name)) return { error: "Each header must be Name: value" };
    if (names.has(name.toLowerCase())) return { error: `“${name}” is listed twice` };
    names.add(name.toLowerCase());
    values[name] = line.slice(index + 1).trim();
  }
  return { values };
}

export function validateClaudeImport(json: string): string | null {
  let parsed: unknown;
  try { parsed = JSON.parse(json); } catch { return "Enter valid JSON"; }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return "Expected an object with mcpServers";
  const servers = (parsed as Record<string, unknown>).mcpServers;
  if (!servers || typeof servers !== "object" || Array.isArray(servers) || !Object.keys(servers).length) return "mcpServers must contain at least one server";
  for (const [name, server] of Object.entries(servers)) {
    if (!name.trim() || !server || typeof server !== "object" || Array.isArray(server)) return "Each named server must be an object";
    const config = server as Record<string, unknown>;
    if (typeof config.command !== "string" && typeof config.url !== "string") return `“${name}” needs a command or URL`;
    if (config.command !== undefined && (typeof config.command !== "string" || !config.command.trim())) return `“${name}” needs a command`;
    if (config.url !== undefined) {
      if (typeof config.url !== "string") return `“${name}” needs a URL`;
      const result = buildMcpServer({ ...draftFromServer(null), name, transport: "http", url: config.url });
      if ("errors" in result) return `“${name}”: ${result.errors.url}`;
    }
    if (config.args !== undefined && (!Array.isArray(config.args) || !config.args.every((arg) => typeof arg === "string"))) return `“${name}”: arguments must be a list of strings`;
    for (const field of ["env", "headers"]) {
      const values = config[field];
      if (values !== undefined && (!values || typeof values !== "object" || Array.isArray(values) || !Object.values(values).every((value) => typeof value === "string"))) return `“${name}”: ${field} must map names to strings`;
    }
  }
  return null;
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
