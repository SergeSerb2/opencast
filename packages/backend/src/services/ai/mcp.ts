import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { MCPServer, AIToolInfo, BackendMethods } from "@opencast/protocol";
import type { AppContext, ToolProvider } from "../../context";
import { httpUrl, providerUrl, redact, safeError } from "./common";
interface Connection {
  client: Client;
  tools: AIToolInfo[];
  names: Map<string, string>;
  secrets: string[];
}
export class MCP implements ToolProvider {
  readonly id = "mcp";
  private connections = new Map<string, Connection>();
  private pending = new Map<string, Promise<Connection>>();
  private errors = new Map<string, string>();
  constructor(readonly ctx: AppContext) {}
  servers(): MCPServer[] {
    return this.ctx.entities.list<MCPServer>("mcpServers").map((r) => r.data);
  }
  server(id: string): MCPServer {
    const s = this.ctx.entities.get<MCPServer>("mcpServers", id)?.data;
    if (!s) throw new Error(`MCP server ${id} was not found`);
    return s;
  }
  async connect(id: string): Promise<Connection> {
    const server = this.server(id);
    if (!server.enabled)
      throw new Error(`MCP server ${server.name} is disabled`);
    const existing = this.connections.get(id);
    if (existing) return existing;
    const pending = this.pending.get(id);
    if (pending) return pending;
    const promise = this.open(server);
    this.pending.set(id, promise);
    try {
      return await promise;
    } finally {
      this.pending.delete(id);
    }
  }
  private async open(server: MCPServer): Promise<Connection> {
    const client = new Client({ name: "OpenCast", version: this.ctx.version });
    const secrets: string[] = [];
    const resolve = async (
      kind: "env" | "header",
      values?: Record<string, string>,
    ) => {
      const out: Record<string, string> = {};
      for (const [name, value] of Object.entries(values ?? {})) {
        const secret =
          value === "$keychain"
            ? await this.ctx.secrets.get(`mcp:${server.id}:${kind}:${name}`)
            : value;
        if (secret === null)
          throw new Error(
            `Configure ${name} for MCP server ${server.name} on this device`,
          );
        out[name] = secret;
        if (secret) secrets.push(secret);
      }
      return out;
    };
    try {
      const transport =
        server.transport === "stdio"
          ? new StdioClientTransport({
              command: server.command!,
              args: server.args,
              env: await resolve("env", server.env),
              stderr: "pipe",
            })
          : new StreamableHTTPClientTransport(httpUrl(server.url!), {
              requestInit: { headers: await resolve("header", server.headers) },
            });
      if (transport instanceof StdioClientTransport)
        transport.stderr?.on("data", () => {});
      await client.connect(transport, { timeout: 30_000 });
      const tools: AIToolInfo[] = [],
        names = new Map<string, string>();
      let cursor: string | undefined;
      do {
        const page = await client.listTools(cursor ? { cursor } : undefined, {
          timeout: 30_000,
        });
        for (const t of page.tools) {
          const name = `mcp:${server.id}.${t.name}`;
          names.set(name, t.name);
          tools.push({
            name,
            title: t.title ?? t.name,
            description: t.description ?? "",
            toolset: `mcp:${server.id}`,
            toolsetTitle: server.name,
            inputSchema: t.inputSchema,
            requiresConfirmation:
              t.annotations?.readOnlyHint !== true ||
              t.annotations?.destructiveHint === true,
          });
        }
        cursor = page.nextCursor;
        if (tools.length > 1000)
          throw new Error("MCP server returned more than 1000 tools");
      } while (cursor);
      const connection = { client, tools, names, secrets };
      client.onclose = () => {
        if (this.connections.get(server.id) === connection) {
          this.connections.delete(server.id);
          this.ctx.events.emit("ai.mcp.changed", {});
        }
      };
      client.onerror = () => {
        this.errors.set(
          server.id,
          "MCP connection failed; reconnect the server",
        );
      };
      this.connections.set(server.id, connection);
      this.errors.delete(server.id);
      this.ctx.events.emit("ai.mcp.changed", {});
      return connection;
    } catch (error) {
      await client.close().catch(() => {});
      const message = redact(safeError(error), secrets);
      this.errors.set(server.id, message);
      this.ctx.events.emit("ai.mcp.changed", {});
      throw new Error(message);
    }
  }
  async disconnect(id: string): Promise<void> {
    const pending = this.pending.get(id);
    if (pending) await pending.catch(() => {});
    const c = this.connections.get(id);
    this.connections.delete(id);
    this.errors.delete(id);
    await c?.client.close();
  }
  async ensure(toolsets: string[]): Promise<void> {
    await Promise.all(
      toolsets
        .filter((t) => t.startsWith("mcp:"))
        .map((t) => this.connect(t.slice(4))),
    );
  }
  async list(): Promise<AIToolInfo[]> {
    return this.servers()
      .filter((s) => s.enabled)
      .flatMap((s) => this.connections.get(s.id)?.tools ?? []);
  }
  async call(
    name: string,
    args: Record<string, unknown>,
    { signal }: { signal?: AbortSignal },
  ): Promise<unknown> {
    const server = this.servers()
      .sort((a, b) => b.id.length - a.id.length)
      .find((s) => name.startsWith(`mcp:${s.id}.`));
    if (!server) throw new Error(`Unknown MCP tool ${name}`);
    const connection = await this.connect(server.id),
      remote = connection.names.get(name);
    if (!remote) throw new Error(`MCP tool ${name} is no longer available`);
    try {
      const result = await connection.client.callTool(
        { name: remote, arguments: args },
        undefined,
        { signal, timeout: 60_000 },
      );
      if (result.isError)
        return JSON.parse(
          JSON.stringify(result, (_key, value: unknown) =>
            typeof value === "string"
              ? redact(value, connection.secrets)
              : value,
          ),
        );
      return result;
    } catch (error) {
      throw new Error(redact(safeError(error), connection.secrets));
    }
  }
  async status() {
    return Promise.all(
      this.servers().map(async (s) => ({
        ...s,
        status: this.connections.has(s.id)
          ? ("connected" as const)
          : this.errors.has(s.id)
            ? ("error" as const)
            : ("disconnected" as const),
        toolCount: this.connections.get(s.id)?.tools.length ?? 0,
        error: this.errors.get(s.id),
        missingSecrets: (
          await Promise.all(
            (
              [
                ["env", s.env],
                ["header", s.headers],
              ] as const
            ).flatMap(([kind, values]) =>
              Object.entries(values ?? {})
                .filter(([, value]) => value === "$keychain")
                .map(async ([name]) =>
                  (await this.ctx.secrets.has(`mcp:${s.id}:${kind}:${name}`))
                    ? []
                    : [`${kind}:${name}`],
                ),
            ),
          )
        ).flat(),
      })),
    );
  }
  async upsert(
    input: BackendMethods["ai.mcp.upsert"]["params"],
  ): Promise<MCPServer> {
    if (!input.name?.trim() || !["stdio", "http"].includes(input.transport))
      throw new Error("MCP server needs a name and supported transport");
    if (input.transport === "http") providerUrl(input.url ?? "");
    if (input.transport === "stdio" && !input.command?.trim())
      throw new Error("Stdio MCP servers need an executable command");
    const id = input.id ?? randomUUID(),
      old = this.ctx.entities.get<MCPServer>("mcpServers", id)?.data;
    const store = async (
      kind: "env" | "header",
      incoming: Record<string, string> | undefined,
      previous?: Record<string, string>,
    ) => {
      if (incoming === undefined) return previous;
      const values: Record<string, string> = {};
      for (const [name, value] of Object.entries(incoming)) {
        if (
          typeof value !== "string" ||
          (kind === "env" && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
        )
          throw new Error(`Invalid MCP ${kind} ${name}`);
        if (
          kind === "header" &&
          (/\r|\n/.test(value) || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name))
        )
          throw new Error("Invalid MCP HTTP header");
        if (value !== "$keychain")
          await this.ctx.secrets.set(`mcp:${id}:${kind}:${name}`, value);
        values[name] = "$keychain";
      }
      for (const name of Object.keys(previous ?? {}))
        if (!(name in values))
          await this.ctx.secrets.delete(`mcp:${id}:${kind}:${name}`);
      return values;
    };
    const env = await store("env", input.env, old?.env),
      headers = await store("header", input.headers, old?.headers);
    await this.disconnect(id);
    const now = Date.now();
    const server: MCPServer = {
      id,
      name: input.name.trim(),
      mentionName:
        input.mentionName ??
        old?.mentionName ??
        input.name.toLowerCase().replace(/\W+/g, "-"),
      description: input.description,
      icon: input.icon,
      transport: input.transport,
      command: input.command,
      args: input.args,
      url: input.url,
      env,
      headers,
      enabled: input.enabled ?? old?.enabled ?? true,
      createdAt: old?.createdAt ?? now,
      updatedAt: now,
    };
    this.ctx.entities.put("mcpServers", id, server);
    return server;
  }
  async delete(id: string): Promise<void> {
    const server = this.server(id);
    await this.disconnect(id);
    for (const [kind, values] of [
      ["env", server.env],
      ["header", server.headers],
    ] as const)
      for (const name of Object.keys(values ?? {}))
        await this.ctx.secrets.delete(`mcp:${id}:${kind}:${name}`);
    this.ctx.entities.delete("mcpServers", id);
  }
  register(): void {
    this.ctx.tools.registerProvider(this);
    this.ctx.rpc.handleAll({
      "ai.mcp.list": () => this.status(),
      "ai.mcp.upsert": (p) => this.upsert(p),
      "ai.mcp.delete": (p) => this.delete(p.id),
      "ai.mcp.test": async ({ id }) => {
        let connection: Connection | undefined;
        try {
          connection = await this.connect(id);
          await connection.client.listTools(undefined, { timeout: 30_000 });
          return {
            ok: true,
            message: "Connected and listed tools",
            tools: connection.tools.map((t) => t.name),
          };
        } catch (e) {
          return {
            ok: false,
            message: redact(safeError(e), connection?.secrets ?? []),
            tools: [],
          };
        }
      },
      "ai.mcp.import": async ({ json }) => {
        const parsed = JSON.parse(json),
          servers = parsed.mcpServers;
        if (!servers || typeof servers !== "object")
          throw new Error("Expected a Claude Desktop-style mcpServers object");
        const entries = Array.isArray(servers)
          ? servers.map((s) => [s.name, s] as const)
          : (Object.entries(servers) as [string, any][]);
        for (const [name, s] of entries) {
          if (
            typeof name !== "string" ||
            !name.trim() ||
            !s ||
            typeof s !== "object" ||
            (!s.command && !s.url)
          )
            throw new Error("Every MCP server needs a name and command or URL");
          if (s.url) providerUrl(s.url);
          if (s.command && typeof s.command !== "string")
            throw new Error("MCP command must be an executable name");
          if (
            (s.args ?? s.arguments) &&
            (!Array.isArray(s.args ?? s.arguments) ||
              (s.args ?? s.arguments).some(
                (a: unknown) => typeof a !== "string",
              ))
          )
            throw new Error("MCP arguments must be strings");
        }
        for (const [name, s] of entries)
          await this.upsert({
            name,
            transport: s.url ? "http" : "stdio",
            command: s.command,
            args: s.args ?? s.arguments,
            env: s.env ?? s.environment,
            url: s.url,
            headers: s.headers,
          });
        return { imported: entries.length };
      },
    });
    const off = this.ctx.entities.onChange((c) => {
      if (c.collection === "mcpServers") {
        this.ctx.events.emit("ai.mcp.changed", {});
        if (c.source === "sync") void this.disconnect(c.id).catch(() => {});
      }
    });
    this.ctx.onShutdown(async () => {
      off();
      await Promise.all(
        [...new Set([...this.connections.keys(), ...this.pending.keys()])].map(
          (id) => this.disconnect(id),
        ),
      );
    });
  }
}
