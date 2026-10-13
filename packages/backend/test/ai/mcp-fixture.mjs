import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
const server = new Server(
  { name: "local-fixture", version: "1.0" },
  { capabilities: { tools: {} } },
);
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "echo",
      title: "Echo",
      description: "Return input and indicate secret injection",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
      annotations: { readOnlyHint: true },
    },
    { name: "write", title: "Write", inputSchema: { type: "object" } },
  ],
}));
server.setRequestHandler(CallToolRequestSchema, async ({ params }) => ({
  content: [
    {
      type: "text",
      text: JSON.stringify({
        text: params.arguments?.text,
        secretConfigured: process.env.FIXTURE_SECRET === "fixture-secret",
      }),
    },
  ],
}));
await server.connect(new StdioServerTransport());
