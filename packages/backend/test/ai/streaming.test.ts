import { afterEach, describe, expect, it, vi } from "vitest";
import type { AIModel, AIProvider, AIToolInfo } from "@opencast/protocol";
import { parseSSE } from "../../src/services/ai/sse";
import { redact, temperature } from "../../src/services/ai/common";
import {
  mapRequest,
  streamAdapter,
  type AdapterRequest,
} from "../../src/services/ai/adapters";
import { inferModel } from "../../src/services/ai/providers";
import { sseResponse } from "./harness";
const model: AIModel = {
  id: "test",
  name: "Test",
  enabled: true,
  capabilities: { vision: true, tools: true, reasoning: true },
};
const provider: AIProvider = {
  id: "p",
  name: "Provider",
  template: "custom",
  api: "openai",
  baseUrl: "https://example.test/v1",
  enabled: true,
  autoFetchModels: false,
  models: [model],
  createdAt: 1,
  updatedAt: 1,
};
const tool: AIToolInfo = {
  name: "web.read",
  title: "Read",
  description: "Read a URL",
  toolset: "web",
  toolsetTitle: "Web",
  inputSchema: { type: "object", properties: { url: { type: "string" } } },
};
function input(api: AIProvider["api"] = "openai"): AdapterRequest {
  return {
    provider: { ...provider, api },
    model,
    headers: { Authorization: "Bearer secret" },
    secrets: ["secret"],
    request: {
      system: "System instructions",
      creativity: "low",
      reasoningEffort: "low",
      tools: [tool],
      messages: [],
    },
    turns: [
      {
        role: "user",
        content: "hello",
        parts: [
          { type: "text", text: "hello" },
          {
            type: "image",
            data: "YWJj",
            mimeType: "image/png",
            name: "test.png",
          },
        ],
      },
    ],
  };
}
afterEach(() => vi.unstubAllGlobals());
describe("SSE framing", () => {
  it("handles every byte boundary, CRLF, comments, Unicode and multiline data", async () => {
    const encoded = new TextEncoder().encode(
      ': keep-alive\r\nid: 1\r\nevent: chunk\r\ndata: {\r\ndata: "text":"hé🙂"}\r\n\r\ndata: [DONE]\r\n\r\n',
    );
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        for (const byte of encoded) c.enqueue(Uint8Array.of(byte));
        c.close();
      },
    });
    const result = [];
    for await (const frame of parseSSE(body)) result.push(frame);
    expect(result).toEqual([
      { id: "1", event: "chunk", data: '{\n"text":"hé🙂"}' },
      { id: "1", event: undefined, data: "[DONE]" },
    ]);
  });
  it("flushes a final frame without a blank line", async () => {
    const result = [];
    for await (const frame of parseSSE(new Response("data: tail").body!))
      result.push(frame);
    expect(result[0].data).toBe("tail");
  });
  it("cancels an idle body when aborted", async () => {
    const controller = new AbortController();
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      cancel() {
        cancelled = true;
      },
    });
    const iterator = parseSSE(body, controller.signal);
    const next = iterator.next();
    controller.abort();
    await expect(next).rejects.toThrow();
    expect(cancelled).toBe(true);
  });
});
it("maps creativity and clamps provider limits", () => {
  expect(
    ["none", "low", "medium", "high", "maximum"].map((c) =>
      temperature(c as any),
    ),
  ).toEqual([0, 0.4, 0.7, 1, 1.3]);
  expect(temperature("maximum", { ...provider, api: "anthropic" }, model)).toBe(
    1,
  );
  expect(
    temperature("maximum", provider, { ...model, id: "o3" }),
  ).toBeUndefined();
  expect(
    temperature("low", provider, {
      ...model,
      capabilities: { temperature: false },
    }),
  ).toBeUndefined();
});
describe("OpenAI and Ollama", () => {
  it.each(["openai", "ollama"] as const)(
    "maps %s multimodal messages and parses fragmented tools/usage",
    async (api) => {
      const req = input(api),
        mapped = mapRequest(req),
        name = (mapped.body.tools as any[])[0].function.name;
      expect(mapped.url).toBe("https://example.test/v1/chat/completions");
      expect(mapped.body.stream_options).toEqual({ include_usage: true });
      expect((mapped.body.messages as any[])[1].content[1].image_url.url).toBe(
        "data:image/png;base64,YWJj",
      );
      const fetch = vi.fn(async (_url: string, _init: unknown) =>
        sseResponse([
          {
            choices: [
              {
                delta: {
                  content: "Hello",
                  reasoning_content: "Think",
                  tool_calls: [
                    {
                      index: 0,
                      id: "call",
                      function: { name, arguments: '{"url":' },
                    },
                  ],
                },
              },
            ],
          },
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    {
                      index: 0,
                      function: { arguments: '"https://example.test"}' },
                    },
                  ],
                },
                finish_reason: "tool_calls",
              },
            ],
          },
          {
            choices: [],
            usage: {
              prompt_tokens: 4,
              completion_tokens: 5,
              completion_tokens_details: { reasoning_tokens: 2 },
            },
          },
        ]),
      );
      vi.stubGlobal("fetch", fetch);
      const events: unknown[] = [];
      const result = await streamAdapter({
        ...req,
        onEvent: (e) => events.push(e),
      });
      expect(result).toMatchObject({
        text: "Hello",
        reasoning: "Think",
        usage: { inputTokens: 4, outputTokens: 5, reasoningTokens: 2 },
        toolCalls: [
          {
            name: "web.read",
            id: "call",
            arguments: { url: "https://example.test" },
          },
        ],
        finishReason: "tool_calls",
      });
      expect(events).toHaveLength(2);
      expect(fetch.mock.calls[0][0]).toBe(mapped.url);
    },
  );
  it("preserves Azure deployment query parameters", () => {
    const req = input();
    req.provider.baseUrl =
      "https://x.openai.azure.com/openai/deployments/test?api-version=2024-10-21";
    expect(mapRequest(req).url).toBe(
      "https://x.openai.azure.com/openai/deployments/test/chat/completions?api-version=2024-10-21",
    );
  });
  it("rejects incomplete tool JSON and unoffered tools", async () => {
    const req = input(),
      name = (mapRequest(req).body.tools as any[])[0].function.name;
    vi.stubGlobal("fetch", async () =>
      sseResponse([
        {
          choices: [
            {
              delta: { tool_calls: [{ function: { name, arguments: "{" } }] },
              finish_reason: "tool_calls",
            },
          ],
        },
      ]),
    );
    await expect(streamAdapter(req)).rejects.toThrow("invalid arguments");
  });
  it("retains HTTP status and redacts echoed API keys", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response('{"error":{"message":"bad secret"}}', { status: 401 }),
    );
    await expect(streamAdapter(input())).rejects.toMatchObject({
      status: 401,
      message: expect.stringContaining("[redacted]"),
    });
  });
  it("reports interrupted streams", async () => {
    vi.stubGlobal("fetch", async () =>
      sseResponse([{ choices: [{ delta: { content: "partial" } }] }], false),
    );
    await expect(streamAdapter(input())).rejects.toThrow(
      "before a completion marker",
    );
  });
});
describe("Anthropic", () => {
  it("maps image/PDF/tool results and preserves signed thinking blocks", async () => {
    const req = input("anthropic");
    req.turns[0].parts.push({
      type: "pdf",
      data: "cGRm",
      mimeType: "application/pdf",
      name: "test.pdf",
    });
    const mapped = mapRequest(req),
      name = (mapped.body.tools as any[])[0].name;
    expect(mapped.url).toBe("https://example.test/v1/messages");
    expect(mapped.body.system).toBe("System instructions");
    expect(mapped.body.thinking).toEqual({
      type: "enabled",
      budget_tokens: 1024,
    });
    expect(mapped.body.temperature).toBeUndefined();
    expect((mapped.body.messages as any[])[0].content[2].type).toBe("document");
    vi.stubGlobal("fetch", async () =>
      sseResponse(
        [
          { type: "message_start", message: { usage: { input_tokens: 8 } } },
          {
            type: "content_block_start",
            index: 0,
            content_block: { type: "thinking", thinking: "" },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "thinking_delta", thinking: "Consider" },
          },
          {
            type: "content_block_delta",
            index: 0,
            delta: { type: "signature_delta", signature: "sig" },
          },
          {
            type: "content_block_start",
            index: 1,
            content_block: { type: "tool_use", id: "call", name, input: {} },
          },
          {
            type: "content_block_delta",
            index: 1,
            delta: {
              type: "input_json_delta",
              partial_json: '{"url":"https://example.test"}',
            },
          },
          {
            type: "message_delta",
            delta: { stop_reason: "tool_use" },
            usage: { output_tokens: 7 },
          },
          { type: "message_stop" },
        ],
        false,
      ),
    );
    const result = await streamAdapter(req);
    expect(result.usage).toEqual({ inputTokens: 8, outputTokens: 7 });
    expect(
      result.toolCalls[0].providerMetadata?.anthropicContent,
    ).toMatchObject([
      { type: "thinking", thinking: "Consider", signature: "sig" },
      { type: "tool_use", input: { url: "https://example.test" } },
    ]);
    req.turns.push(
      {
        role: "assistant",
        content: "",
        parts: [],
        toolCalls: result.toolCalls,
      },
      {
        role: "tool",
        content: "page",
        parts: [{ type: "text", text: "page" }],
        toolCallId: "call",
        name: "web.read",
      },
    );
    const body = mapRequest(req).body;
    expect((body.messages as any[])[1].content[0].signature).toBe("sig");
    expect((body.messages as any[])[2].content[0]).toMatchObject({
      type: "tool_result",
      tool_use_id: "call",
    });
  });
});
describe("Gemini", () => {
  it("maps inline attachments, thinking and declarations; parses function calls", async () => {
    const req = input("google"),
      mapped = mapRequest(req),
      name = (mapped.body.tools as any[])[0].functionDeclarations[0].name;
    expect(mapped.url).toBe(
      "https://example.test/v1beta/models/test:streamGenerateContent?alt=sse",
    );
    expect((mapped.body.contents as any[])[0].parts[1]).toEqual({
      inlineData: { mimeType: "image/png", data: "YWJj" },
    });
    vi.stubGlobal("fetch", async () =>
      sseResponse(
        [
          {
            candidates: [
              {
                content: {
                  parts: [
                    { text: "thinking", thought: true },
                    {
                      functionCall: {
                        name,
                        args: { url: "https://example.test" },
                      },
                      thoughtSignature: "sig",
                    },
                  ],
                },
                finishReason: "STOP",
              },
            ],
            usageMetadata: {
              promptTokenCount: 5,
              candidatesTokenCount: 6,
              thoughtsTokenCount: 2,
            },
          },
        ],
        false,
      ),
    );
    const result = await streamAdapter(req);
    expect(result.reasoning).toBe("thinking");
    expect(result.toolCalls[0].providerMetadata?.googlePart).toMatchObject({
      thoughtSignature: "sig",
    });
    expect(result.usage).toEqual({
      inputTokens: 5,
      outputTokens: 6,
      reasoningTokens: 2,
    });
    req.turns.push({
      role: "tool",
      content: '{"ok":true}',
      parts: [],
      toolCallId: result.toolCalls[0].id,
      name: "web.read",
    });
    expect(
      (mapRequest(req).body.contents as any[])[0].parts.at(-1).functionResponse,
    ).toEqual({ name, response: { result: { ok: true } } });
  });
});

it("honors explicit temperature support overrides and documented context defaults", () => {
  expect(
    temperature("low", provider, {
      ...model,
      id: "o3",
      capabilities: { temperature: true },
    }),
  ).toBe(0.4);
  expect(inferModel("gpt-4.1", "openai").contextWindow).toBe(1047576);
  expect(inferModel("gpt-5", "openai").contextWindow).toBe(400000);
  expect(inferModel("gpt-4o", "openai").contextWindow).toBe(128000);
  expect(inferModel("unknown-model", "openai").contextWindow).toBeUndefined();
  expect(inferModel("gpt-6-astra", "openai").capabilities.tools).toBe(false);
});
it("maps the no-reasoning choice to the lowest supported wire effort", () => {
  const req = input();
  req.request.reasoningEffort = "none";
  req.model = { ...model, id: "gpt-5" };
  expect(mapRequest(req).body.reasoning_effort).toBe("minimal");
  req.model = { ...model, id: "o3" };
  expect(mapRequest(req).body.reasoning_effort).toBe("low");
  req.model = { ...model, id: "gpt-6.1-sol" };
  expect(mapRequest(req).body.reasoning_effort).toBe("low");
});

it("redacts token-only echoes of custom authorization headers", () => {
  expect(
    redact("Rejected abc123token and Bearer abc123token", [
      "Bearer abc123token",
    ]),
  ).not.toContain("abc123token");
});
