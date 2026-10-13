import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { afterEach, expect, it } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { harness } from "./harness";
let h: Awaited<ReturnType<typeof harness>> | undefined;
afterEach(async () => {
  await h?.close();
  h = undefined;
});
it("connects stdio lazily, injects Keychain env and calls tools", async () => {
  h = await harness();
  const server = await h.rpc("ai.mcp.upsert", {
    name: "Fixture",
    transport: "stdio",
    command: process.execPath,
    args: [fileURLToPath(new URL("./mcp-fixture.mjs", import.meta.url))],
    env: { FIXTURE_SECRET: "fixture-secret" },
  });
  expect(JSON.stringify(h.ctx.entities.dirty())).not.toContain(
    "fixture-secret",
  );
  expect(server.env).toEqual({ FIXTURE_SECRET: "$keychain" });
  expect((await h.rpc("ai.mcp.list", {}))[0]).toMatchObject({
    status: "disconnected",
    toolCount: 0,
  });
  const test = await h.rpc("ai.mcp.test", { id: server.id });
  expect(test.ok).toBe(true);
  expect(test.tools).toHaveLength(2);
  const tools = await h.rpc("ai.tools.list", {});
  expect(
    tools.find((t) => t.name.endsWith(".echo"))?.requiresConfirmation,
  ).toBe(false);
  expect(
    tools.find((t) => t.name.endsWith(".write"))?.requiresConfirmation,
  ).toBe(true);
  const result = (await h.ctx.tools.call(`mcp:${server.id}.echo`, {
    text: "Hello",
  })) as { content: { text: string }[] };
  expect(JSON.parse(result.content[0].text)).toEqual({
    text: "Hello",
    secretConfigured: true,
  });
  expect((await h.rpc("ai.mcp.list", {}))[0].status).toBe("connected");
  await h.rpc("ai.mcp.delete", { id: server.id });
  expect(h.keys.size).toBe(0);
  expect(await h.rpc("ai.mcp.list", {})).toEqual([]);
}, 10_000);
it("connects streamable HTTP with Keychain headers", async () => {
  h = await harness();
  let authorized = false;
  const transports: StreamableHTTPServerTransport[] = [];
  const server = createServer(async (req, res) => {
    authorized ||= req.headers.authorization === "Bearer fixture-secret";
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    transports.push(transport);
    const mcp = new Server(
      { name: "http-fixture", version: "1" },
      { capabilities: { tools: {} } },
    );
    mcp.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "ping",
          inputSchema: { type: "object" },
          annotations: { readOnlyHint: true },
        },
      ],
    }));
    mcp.setRequestHandler(CallToolRequestSchema, async () => ({
      content: [{ type: "text", text: "pong" }],
    }));
    await mcp.connect(transport);
    await transport.handleRequest(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as { port: number };
    const config = await h.rpc("ai.mcp.upsert", {
      name: "HTTP",
      transport: "http",
      url: `http://127.0.0.1:${address.port}/mcp`,
      headers: { Authorization: "Bearer fixture-secret" },
    });
    const test = await h.rpc("ai.mcp.test", { id: config.id });
    expect(test.ok).toBe(true);
    expect(authorized).toBe(true);
    expect(JSON.stringify(config)).not.toContain("fixture-secret");
    const result = (await h.ctx.tools.call(`mcp:${config.id}.ping`, {})) as {
      content: { text: string }[];
    };
    expect(result.content[0].text).toBe("pong");
  } finally {
    await h.close();
    h = undefined;
    await Promise.all(transports.map((t) => t.close()));
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}, 10_000);
it("imports Claude Desktop maps while excluding credentials from synced entities", async () => {
  h = await harness();
  expect(
    await h.rpc("ai.mcp.import", {
      json: JSON.stringify({
        mcpServers: {
          example: {
            command: "node",
            args: ["example.mjs"],
            env: { API_KEY: "private-import-key" },
          },
        },
      }),
    }),
  ).toEqual({ imported: 1 });
  expect(JSON.stringify(h.ctx.entities.dirty())).not.toContain(
    "private-import-key",
  );
  expect((await h.rpc("ai.mcp.list", {}))[0].name).toBe("example");
});
